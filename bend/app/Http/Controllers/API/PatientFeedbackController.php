<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\PatientFeedback;
use App\Models\PatientVisit;
use App\Support\PatientFeedbackRules;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PatientFeedbackController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $patient = $request->user()->patient;
        if (!$patient) {
            return response()->json([
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'per_page' => 10,
                    'total' => 0,
                ],
            ]);
        }

        $feedback = PatientFeedback::with(['visit.service', 'dentistSchedule'])
            ->where('patient_id', $patient->id)
            ->latest()
            ->paginate(10);

        $transformed = $feedback->getCollection()->map(function (PatientFeedback $entry) {
            return $this->formatFeedbackPayload($entry);
        });

        return response()->json([
            'data' => $transformed,
            'meta' => [
                'current_page' => $feedback->currentPage(),
                'last_page' => $feedback->lastPage(),
                'per_page' => $feedback->perPage(),
                'total' => $feedback->total(),
            ],
        ]);
    }

    public function showByVisit(Request $request, PatientVisit $visit): JsonResponse
    {
        $patient = $request->user()->patient;
        if (!$patient || $visit->patient_id !== $patient->id) {
            return response()->json(['message' => 'Visit not found.'], 404);
        }

        $feedback = $visit->feedback;
        $eligibility = PatientFeedbackRules::visitEligibility($visit, (bool) $feedback);

        return response()->json([
            'feedback' => $feedback ? $this->formatFeedbackPayload($feedback) : null,
            'eligibility' => [
                'can_rate' => $eligibility['can_rate'],
                'reason' => $eligibility['reason'],
                'rating_window_expires_at' => optional($eligibility['deadline'])->toIso8601String(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $patient = $request->user()->patient;
        if (!$patient) {
            return response()->json(['message' => 'Patient profile required.'], 403);
        }

        $data = $this->validatePayload($request, true);

        /** @var PatientVisit $visit */
        $visit = PatientVisit::with('feedback')
            ->where('id', $data['patient_visit_id'])
            ->where('patient_id', $patient->id)
            ->first();

        if (!$visit) {
            return response()->json(['message' => 'Visit not found.'], 404);
        }

        if ($visit->feedback) {
            return response()->json(['message' => 'Feedback already submitted for this visit.'], 422);
        }

        $eligibility = PatientFeedbackRules::visitEligibility($visit, false);
        if (!$eligibility['can_rate']) {
            return response()->json([
                'message' => $this->eligibilityMessage($eligibility['reason']),
                'eligibility' => $eligibility,
            ], 422);
        }

        $responses = $data['retention_responses'];
        $averageScore = PatientFeedbackRules::averageScore($responses);

        $now = now();
        $editableUntil = $now->copy()->addHours((int) config('patient_feedback.edit_window_hours', 24));

        $feedback = DB::transaction(function () use (
            $patient,
            $visit,
            $responses,
            $averageScore,
            $data,
            $now,
            $editableUntil
        ) {
            return PatientFeedback::create([
                'patient_id' => $patient->id,
                'patient_visit_id' => $visit->id,
                'service_id' => $visit->service_id,
                'dentist_schedule_id' => $visit->dentist_schedule_id,
                'retention_responses' => $responses,
                'retention_score_avg' => $averageScore,
                'dentist_rating' => $data['dentist_rating'],
                'dentist_issue_note' => $data['dentist_issue_note'] ?? null,
                'submitted_at' => $now,
                'last_edited_at' => $now,
                'editable_until' => $editableUntil,
            ]);
        });

        return response()->json($this->formatFeedbackPayload($feedback), 201);
    }

    public function update(Request $request, PatientFeedback $feedback): JsonResponse
    {
        $patient = $request->user()->patient;
        if (!$patient || $feedback->patient_id !== $patient->id) {
            return response()->json(['message' => 'Feedback not found.'], 404);
        }

        if (!PatientFeedbackRules::feedbackEditable($feedback)) {
            $feedback->locked_at = $feedback->locked_at ?? now();
            $feedback->locked_reason = $feedback->locked_reason ?? 'edit_window_elapsed';
            $feedback->save();

            return response()->json(['message' => 'Feedback can no longer be edited.'], 422);
        }

        $data = $this->validatePayload($request, false);
        $responses = $data['retention_responses'];
        $averageScore = PatientFeedbackRules::averageScore($responses);

        $feedback->fill([
            'retention_responses' => $responses,
            'retention_score_avg' => $averageScore,
            'dentist_rating' => $data['dentist_rating'],
            'dentist_issue_note' => $data['dentist_issue_note'] ?? null,
            'last_edited_at' => now(),
        ]);

        $feedback->save();

        return response()->json($this->formatFeedbackPayload($feedback));
    }

    private function validatePayload(Request $request, bool $requireVisitId): array
    {
        $questionKeys = PatientFeedbackRules::questionKeys();
        $rules = [
            'retention_responses' => ['required', 'array'],
            'dentist_rating' => ['required', 'integer', 'between:' . config('patient_feedback.dentist_rating_min', 1) . ',' . config('patient_feedback.dentist_rating_max', 5)],
            'dentist_issue_note' => ['nullable', 'string', 'max:2000'],
        ];

        if ($requireVisitId) {
            $rules['patient_visit_id'] = ['required', 'integer', 'exists:patient_visits,id'];
        }

        $data = $request->validate($rules);
        $responses = $data['retention_responses'];

        foreach ($questionKeys as $key) {
            if (!array_key_exists($key, $responses)) {
                throw ValidationException::withMessages([
                    "retention_responses.$key" => 'This field is required.',
                ]);
            }

            $value = $responses[$key];
            if (!is_numeric($value) || (int) $value < 1 || (int) $value > 5) {
                throw ValidationException::withMessages([
                    "retention_responses.$key" => 'Responses must be numbers between 1 and 5.',
                ]);
            }
        }

        return $data;
    }

    private function formatFeedbackPayload(PatientFeedback $feedback): array
    {
        $feedback->loadMissing(['visit.service', 'dentistSchedule']);

        return [
            'id' => $feedback->id,
            'patient_visit_id' => $feedback->patient_visit_id,
            'service_id' => $feedback->service_id,
            'service_name' => $feedback->visit?->service?->name,
            'dentist_schedule_id' => $feedback->dentist_schedule_id,
            'dentist_name' => $feedback->dentistSchedule?->dentist_name,
            'retention_responses' => $feedback->retention_responses,
            'retention_score_avg' => $feedback->retention_score_avg,
            'dentist_rating' => $feedback->dentist_rating,
            'dentist_issue_note' => $feedback->dentist_issue_note,
            'submitted_at' => optional($feedback->submitted_at)->toIso8601String(),
            'last_edited_at' => optional($feedback->last_edited_at)->toIso8601String(),
            'editable_until' => optional($feedback->editable_until)->toIso8601String(),
            'locked_at' => optional($feedback->locked_at)->toIso8601String(),
            'locked_reason' => $feedback->locked_reason,
            'is_editable' => $feedback->isEditable(),
        ];
    }

    private function eligibilityMessage(?string $reason): string
    {
        return match ($reason) {
            'visit_not_completed' => 'Only completed visits can be rated.',
            'feedback_exists' => 'This visit already has feedback.',
            'window_elapsed' => 'The rating window has expired for this visit.',
            default => 'This visit is not eligible for rating.',
        };
    }

    public function dentistFeedback(Request $request, string $dentist): JsonResponse
    {
        $perPage = (int) $request->query('per_page', 10);
        $perPage = min(max($perPage, 5), 50);

        $query = PatientFeedback::with(['patient', 'visit.service'])
            ->orderByDesc('submitted_at');

        if ($dentist === 'unassigned') {
            $query->whereNull('dentist_schedule_id');
        } else {
            $query->where('dentist_schedule_id', $dentist);
        }

        $hasComment = $request->query('has_comment', 'all');
        if ($hasComment === 'with') {
            $query->whereNotNull('dentist_issue_note')->where('dentist_issue_note', '!=', '');
        } elseif ($hasComment === 'without') {
            $query->where(function ($q) {
                $q->whereNull('dentist_issue_note')->orWhere('dentist_issue_note', '=', '');
            });
        }

        $rating = $request->query('rating');
        if (is_numeric($rating)) {
            $query->where('dentist_rating', (int) $rating);
        }

        $feedback = $query->paginate($perPage);

        $transformed = $feedback->getCollection()->map(function (PatientFeedback $entry) {
            $patient = $entry->patient;
            $sentiment = $this->sentimentFromRating($entry->dentist_rating);

            return [
                'id' => $entry->id,
                'patient_name' => $this->anonymizePatientName($patient?->first_name, $patient?->last_name),
                'service_name' => $entry->visit?->service?->name,
                'dentist_rating' => $entry->dentist_rating,
                'retention_score_avg' => $entry->retention_score_avg,
                'dentist_issue_note' => $entry->dentist_issue_note,
                'retention_responses' => $entry->retention_responses,
                'submitted_at' => optional($entry->submitted_at)->toIso8601String(),
                'sentiment' => $sentiment,
            ];
        });

        return response()->json([
            'data' => $transformed,
            'meta' => [
                'current_page' => $feedback->currentPage(),
                'last_page' => $feedback->lastPage(),
                'per_page' => $feedback->perPage(),
                'total' => $feedback->total(),
            ],
        ]);
    }

    private function anonymizePatientName(?string $first, ?string $last): string
    {
        $first = trim((string) $first);
        $last = trim((string) $last);

        if ($first === '' && $last === '') {
            return 'Anonymous';
        }

        $firstInitial = $first !== '' ? $first : '';
        $lastInitial = $last !== '' ? strtoupper($last[0]) . '.' : '';

        return trim("{$firstInitial} {$lastInitial}");
    }

    private function sentimentFromRating(?int $rating): string
    {
        if ($rating === null) {
            return 'neutral';
        }

        if ($rating >= 4) {
            return 'positive';
        }

        if ($rating <= 2) {
            return 'negative';
        }

        return 'neutral';
    }
}

