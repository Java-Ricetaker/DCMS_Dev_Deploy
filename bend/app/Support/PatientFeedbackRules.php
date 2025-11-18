<?php

namespace App\Support;

use App\Models\PatientFeedback;
use App\Models\PatientVisit;
use Carbon\Carbon;

class PatientFeedbackRules
{
    public static function questionKeys(): array
    {
        return array_keys(config('patient_feedback.questions', []));
    }

    public static function ratingWindowDeadline(PatientVisit $visit): ?Carbon
    {
        $windowDays = (int) config('patient_feedback.rating_window_days', 7);
        if ($windowDays <= 0) {
            return null;
        }

        $base = $visit->end_time
            ? Carbon::parse($visit->end_time)
            : ($visit->start_time
                ? Carbon::parse($visit->start_time)
                : ($visit->visit_date
                    ? Carbon::parse($visit->visit_date)->endOfDay()
                    : null));

        return $base ? $base->copy()->addDays($windowDays) : null;
    }

    public static function visitEligibility(PatientVisit $visit, bool $hasFeedback): array
    {
        if ($visit->status !== 'completed') {
            return [
                'can_rate' => false,
                'reason' => 'visit_not_completed',
                'deadline' => null,
            ];
        }

        if ($hasFeedback) {
            return [
                'can_rate' => false,
                'reason' => 'feedback_exists',
                'deadline' => self::ratingWindowDeadline($visit),
            ];
        }

        $deadline = self::ratingWindowDeadline($visit);
        if ($deadline && now()->greaterThan($deadline)) {
            return [
                'can_rate' => false,
                'reason' => 'window_elapsed',
                'deadline' => $deadline,
            ];
        }

        return [
            'can_rate' => true,
            'reason' => null,
            'deadline' => $deadline,
        ];
    }

    public static function feedbackEditable(PatientFeedback $feedback): bool
    {
        if ($feedback->locked_at !== null) {
            return false;
        }

        if ($feedback->editable_until !== null) {
            return now()->lessThan($feedback->editable_until);
        }

        $hours = (int) config('patient_feedback.edit_window_hours', 24);
        if ($hours <= 0 || $feedback->submitted_at === null) {
            return false;
        }

        return now()->lessThan($feedback->submitted_at->copy()->addHours($hours));
    }

    public static function averageScore(array $responses): ?float
    {
        if (empty($responses)) {
            return null;
        }

        $filtered = array_filter($responses, static fn ($value) => is_numeric($value));
        $count = count($filtered);

        if ($count === 0) {
            return null;
        }

        return round(array_sum($filtered) / $count, 2);
    }
}

