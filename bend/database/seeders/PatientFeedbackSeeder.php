<?php

namespace Database\Seeders;

use App\Models\PatientFeedback;
use App\Models\PatientVisit;
use Illuminate\Database\Seeder;
use Illuminate\Support\Arr;
use Illuminate\Support\Carbon;

class PatientFeedbackSeeder extends Seeder
{
    /**
     * This seeder is used programmatically by other seeders (e.g. AnalyticsSeeder)
     * to attach patient feedback to eligible visits. The run() method is unused.
     */
    public function run(): void
    {
        // Intentionally left empty
    }

    /**
     * Seed feedback for a specific visit if eligible.
     */
    public static function seedForVisit(PatientVisit $visit): ?PatientFeedback
    {
        // Only completed visits with linked portal users should get seeded feedback
        if ($visit->status !== 'completed') {
            return null;
        }

        $patient = $visit->patient()->with('user')->first();
        if (!$patient || !$patient->user_id) {
            return null;
        }

        if (PatientFeedback::where('patient_visit_id', $visit->id)->exists()) {
            return null;
        }

        $questions = config('patient_feedback.questions', []);
        if (empty($questions)) {
            return null;
        }

        $hasIssue = rand(1, 100) <= 20; // 20% chance of an issue report
        $responses = [];
        foreach (array_keys($questions) as $key) {
            $responses[$key] = $hasIssue ? rand(2, 4) : rand(4, 5);
        }
        if ($hasIssue) {
            $randomKey = array_rand($responses);
            $responses[$randomKey] = rand(1, 3);
        }

        $issueNotes = [
            'Patient reported discomfort after the procedure.',
            'Patient wanted a clearer explanation of next steps.',
            'Patient experienced longer wait times than expected.',
            'Patient raised a concern with chairside communication.',
            'Patient requested better pain management options.',
        ];

        $averageScore = round(array_sum($responses) / count($responses), 2);
        $dentistRating = $hasIssue ? rand(1, 3) : rand(4, 5);
        $issueNote = $hasIssue ? Arr::random($issueNotes) : null;

        $baseTime = $visit->end_time
            ? Carbon::parse($visit->end_time)
            : Carbon::createFromFormat('Y-m-d', $visit->visit_date)->endOfDay();

        $submittedAt = $baseTime->copy()->addHours(rand(6, 48));
        if ($submittedAt->isFuture()) {
            $submittedAt = now()->subHours(rand(6, 24));
        }

        $editableUntil = $submittedAt->copy()->addHours((int) config('patient_feedback.edit_window_hours', 24));
        $lockedAt = $editableUntil->copy()->addHours(rand(1, 24));

        return PatientFeedback::create([
            'patient_id' => $visit->patient_id,
            'patient_visit_id' => $visit->id,
            'service_id' => $visit->service_id,
            'dentist_schedule_id' => $visit->dentist_schedule_id,
            'retention_responses' => $responses,
            'retention_score_avg' => $averageScore,
            'dentist_rating' => $dentistRating,
            'dentist_issue_note' => $issueNote,
            'submitted_at' => $submittedAt,
            'last_edited_at' => $submittedAt,
            'editable_until' => $editableUntil,
            'locked_at' => $lockedAt,
            'locked_reason' => 'edit_window_elapsed',
            'created_at' => $submittedAt,
            'updated_at' => $lockedAt,
        ]);
    }
}

