<?php

namespace Database\Seeders;

use App\Models\Patient;
use App\Models\PatientVisit;
use App\Models\Service;
use App\Models\User;
use App\Models\DentistSchedule;
use App\Services\ClinicDateResolverService;
use Carbon\Carbon;
use Database\Seeders\Support\RealisticVisitFactory;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Seeder;

class ReportSeeder extends Seeder
{
    /**
     * Seed data to test monthly reports.
     */
    public function run(): void
    {
        $now = Carbon::now();
        $startOfMonth = (clone $now)->startOfMonth();
        $endOfMonth = (clone $now)->endOfMonth();

        // Ensure there are patients and services
        $patients = Patient::with('user')->get();
        $services = Service::query()
            ->where('is_active', true)
            ->where('is_excluded_from_analytics', false)
            ->get();
        $adminUser = User::where('role', 'admin')->first();

        if ($patients->isEmpty()) {
            $this->command?->warn('No patients found; skipping ReportSeeder');
            return;
        }
        if ($services->isEmpty()) {
            $this->command?->warn('No services found; skipping ReportSeeder');
            return;
        }
        if (!$adminUser) {
            $this->command?->warn('No admin user found; skipping ReportSeeder');
            return;
        }

        // Clear existing visits for the month to avoid duplication when re-seeding
        PatientVisit::whereBetween('start_time', [$startOfMonth, $endOfMonth])->delete();

        $numDays = (int) $startOfMonth->diffInDays($endOfMonth) + 1;

        $factory = new RealisticVisitFactory($adminUser);
        $resolver = app(ClinicDateResolverService::class);

        $visitCount = 0;
        $appointmentCount = 0;
        $paymentCount = 0;

        for ($d = 0; $d < $numDays; $d++) {
            $day = (clone $startOfMonth)->addDays($d);

            $snap = $resolver->resolve($day);

            if (
                !$snap['is_open'] ||
                empty($snap['open_time']) ||
                empty($snap['close_time'])
            ) {
                continue;
            }

            $capacity = max(1, (int) $snap['effective_capacity']);
            $grid = ClinicDateResolverService::buildBlocks($snap['open_time'], $snap['close_time']);

            if (empty($grid)) {
                continue;
            }

            $slotUsage = array_fill_keys($grid, 0);
            $activeDentists = $this->resolveDentistsForDay($day, $snap);

            $maxVisitsToday = min(16, (int) round($capacity * count($grid) * 0.6));

            if ($maxVisitsToday <= 0) {
                continue;
            }

            if ($maxVisitsToday >= 6) {
                $visitsToday = random_int(6, $maxVisitsToday);
            } else {
                $visitsToday = random_int(1, $maxVisitsToday);
            }

            $createdToday = 0;
            $attempts = 0;

            while ($createdToday < $visitsToday && $attempts < $visitsToday * 3) {
                $attempts++;
                $result = $factory->createVisitForDay(
                    $day,
                    $patients,
                    $services,
                    $activeDentists,
                    $slotUsage,
                    $grid,
                    $capacity
                );

                if (!$result['visit']) {
                    continue;
                }

                $createdToday++;
                $visitCount++;
                if ($result['appointment']) {
                    $appointmentCount++;
                }
                if ($result['payment']) {
                    $paymentCount++;
                }
            }
        }

        $this->command?->info(
            sprintf(
                'ReportSeeder: seeded %d visits, %d appointments, and %d payments for %s',
                $visitCount,
                $appointmentCount,
                $paymentCount,
                $startOfMonth->format('Y-m')
            )
        );
    }

    private function resolveDentistsForDay(Carbon $day, array $snap): EloquentCollection
    {
        $ids = collect($snap['active_dentist_ids'] ?? [])
            ->filter()
            ->values();

        if ($ids->isNotEmpty()) {
            return DentistSchedule::whereIn('id', $ids)->get();
        }

        return DentistSchedule::activeOnDate($day)->get();
    }
}