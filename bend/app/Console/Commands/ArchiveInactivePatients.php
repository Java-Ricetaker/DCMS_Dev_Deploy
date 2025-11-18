<?php

namespace App\Console\Commands;

use App\Models\Patient;
use App\Services\SystemLogService;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class ArchiveInactivePatients extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'patients:archive-inactive {--dry-run : Only list accounts that would be archived}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Archive patient accounts with no visits recorded in the last five years.';

    /**
     * Execute the console command.
     */
    public function handle(): int
    {
        $dryRun = (bool) $this->option('dry-run');
        $now = now();
        $cutoff = $now->copy()->subYears(5)->startOfDay();

        $this->info(sprintf(
            '%s archiving pass starting. Cutoff date: %s',
            $dryRun ? '[DRY RUN]' : 'Automatic',
            $cutoff->toDateString()
        ));

        $archivedCount = 0;
        $checked = 0;

        Patient::query()
            ->whereNull('archived_at')
            ->whereNotNull('user_id')
            ->whereHas('user', function ($query) {
                $query->where('role', 'patient');
            })
            ->with([
                'user:id,name,email,role',
                'latestCompletedVisit:id,patient_id,visit_date',
            ])
            ->orderBy('id')
            ->chunkById(250, function ($patients) use ($cutoff, $dryRun, &$archivedCount, &$checked) {
                foreach ($patients as $patient) {
                    $checked++;

                    $lastVisit = $patient->latestCompletedVisit?->visit_date instanceof Carbon
                        ? $patient->latestCompletedVisit->visit_date
                        : ($patient->latestCompletedVisit?->visit_date ? Carbon::parse($patient->latestCompletedVisit->visit_date) : null);

                    $referenceDate = $lastVisit ?? $patient->created_at;

                    if (!$referenceDate || $referenceDate->gt($cutoff)) {
                        continue;
                    }

                    $reason = $lastVisit
                        ? 'No completed visits in the last 5 years'
                        : 'No visits recorded since account creation (>5 years)';

                    if ($dryRun) {
                        $this->line(sprintf(
                            '[DRY RUN] Would archive patient #%d (%s %s) last_visit=%s created_at=%s',
                            $patient->id,
                            $patient->first_name,
                            $patient->last_name,
                            $lastVisit?->toDateString() ?? 'none',
                            optional($patient->created_at)->toDateString()
                        ));
                        $archivedCount++;
                        continue;
                    }

                    $patient->forceFill([
                        'archived_at' => now(),
                        'archived_by' => null,
                        'archived_reason' => $reason,
                    ])->save();

                    SystemLogService::logPatient(
                        'archived_inactive',
                        $patient->id,
                        'Patient auto-archived after 5 years of inactivity.',
                        [
                            'patient_id' => $patient->id,
                            'user_id' => $patient->user_id,
                            'last_visit_date' => $lastVisit?->toDateString(),
                            'created_at' => optional($patient->created_at)->toDateString(),
                            'archived_at' => $patient->archived_at?->toDateTimeString(),
                            'reason' => $reason,
                        ]
                    );

                    $this->line(sprintf(
                        'Archived patient #%d (%s %s) last_visit=%s',
                        $patient->id,
                        $patient->first_name,
                        $patient->last_name,
                        $lastVisit?->toDateString() ?? 'none'
                    ));

                    $archivedCount++;
                }
            });

        $this->info(sprintf(
            '%s archiving complete. Checked %d patients, %d %s.',
            $dryRun ? '[DRY RUN]' : 'Automatic',
            $checked,
            $archivedCount,
            $dryRun ? 'would be archived' : 'archived'
        ));

        return self::SUCCESS;
    }
}

