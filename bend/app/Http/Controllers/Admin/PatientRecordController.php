<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Models\PatientVisit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class PatientRecordController extends Controller
{
    /**
     * Search for patients using name, patient ID, or contact number.
     */
    public function search(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'query' => ['nullable', 'string', 'max:100'],
            'patient_id' => ['nullable', 'integer', 'min:1'],
            'contact' => ['nullable', 'string', 'max:30'],
            'limit' => ['nullable', 'integer', 'min:1', 'max:50'],
            'include_archived' => ['nullable', 'boolean'],
        ]);

        $limit = $validated['limit'] ?? 20;

        $builder = Patient::query()->with('user');

        if (!($validated['include_archived'] ?? false)) {
            $builder->whereNull('archived_at');
        }

        if (!empty($validated['patient_id'])) {
            $builder->where('id', $validated['patient_id']);
        }

        if (!empty($validated['contact'])) {
            $contact = $validated['contact'];
            $builder->where('contact_number', 'like', "%{$contact}%");
        }

        if (!empty($validated['query'])) {
            $term = $validated['query'];
            $builder->where(function ($q) use ($term) {
                $like = "%{$term}%";
                $q->where('first_name', 'like', $like)
                    ->orWhere('last_name', 'like', $like)
                    ->orWhereRaw("CONCAT(first_name, ' ', last_name) LIKE ?", [$like])
                    ->orWhere('contact_number', 'like', $like);

                if (is_numeric($term)) {
                    $q->orWhere('id', (int) $term);
                }
            });
        }

        $patients = $builder
            ->orderBy('last_name')
            ->orderBy('first_name')
            ->limit($limit)
            ->get()
            ->map(fn (Patient $patient) => $this->formatPatientSummary($patient))
            ->values();

        return response()->json([
            'success' => true,
            'data' => $patients,
        ]);
    }

    /**
     * Return basic patient profile details (no medical notes).
     */
    public function show(Request $request, Patient $patient): JsonResponse
    {
        if (!$request->boolean('include_archived') && $patient->archived_at) {
            abort(404);
        }

        $patient->loadMissing('user');

        return response()->json([
            'success' => true,
            'data' => $this->formatPatientProfile($patient),
        ]);
    }

    /**
     * List visits for a patient with filters (no notes).
     */
    public function visits(Request $request, Patient $patient): JsonResponse
    {
        $validated = $request->validate([
            'start_date' => ['nullable', 'date'],
            'end_date' => ['nullable', 'date', 'after_or_equal:start_date'],
            'visit_type' => ['nullable', Rule::in(['walk-in', 'appointment'])],
            'status' => ['nullable', Rule::in(['pending', 'active', 'in_progress', 'completed', 'cancelled', 'no_show'])],
            'dentist_schedule_id' => ['nullable', 'integer', 'exists:dentist_schedules,id'],
            'per_page' => ['nullable', 'integer', 'min:5', 'max:100'],
            'sort' => ['nullable', Rule::in(['visit_date', 'created_at'])],
            'direction' => ['nullable', Rule::in(['asc', 'desc'])],
        ]);

        $perPage = $validated['per_page'] ?? 15;
        $sort = $validated['sort'] ?? 'visit_date';
        $direction = $validated['direction'] ?? 'desc';

        $query = PatientVisit::query()
            ->with([
                'service:id,name',
                'assignedDentist:id,dentist_name,dentist_code',
                'visitNotes:id,patient_visit_id',
            ])
            ->where('patient_id', $patient->id);

        if (!empty($validated['start_date'])) {
            $query->whereDate('visit_date', '>=', $validated['start_date']);
        }

        if (!empty($validated['end_date'])) {
            $query->whereDate('visit_date', '<=', $validated['end_date']);
        }

        if (!empty($validated['visit_type'])) {
            if ($validated['visit_type'] === 'walk-in') {
                $query->whereNull('appointment_id');
            } else {
                $query->whereNotNull('appointment_id');
            }
        }

        if (!empty($validated['status'])) {
            $query->where('status', $validated['status']);
        }

        if (!empty($validated['dentist_schedule_id'])) {
            $query->where('dentist_schedule_id', $validated['dentist_schedule_id']);
        }

        $visits = $query
            ->orderBy($sort, $direction)
            ->paginate($perPage)
            ->through(function (PatientVisit $visit) {
                return [
                    'id' => $visit->id,
                    'visit_code' => $visit->visit_code,
                    'visit_date' => optional($visit->visit_date)->toDateString(),
                    'start_time' => optional($visit->start_time)->toDateTimeString(),
                    'end_time' => optional($visit->end_time)->toDateTimeString(),
                    'status' => $visit->status,
                    'service' => [
                        'id' => $visit->service?->id,
                        'name' => $visit->service?->name,
                    ],
                    'visit_type' => $visit->appointment_id ? 'appointment' : 'walk-in',
                    'dentist' => [
                        'id' => $visit->dentist_schedule_id,
                        'name' => $visit->assignedDentist?->dentist_name,
                        'code' => $visit->assignedDentist?->dentist_code,
                    ],
                    'has_notes' => $visit->visitNotes !== null,
                ];
            });

        return response()->json([
            'success' => true,
            'data' => $visits->items(),
            'meta' => [
                'current_page' => $visits->currentPage(),
                'per_page' => $visits->perPage(),
                'total' => $visits->total(),
                'last_page' => $visits->lastPage(),
            ],
        ]);
    }

    /**
     * Detailed visit info including dentist notes.
     */
    public function visitDetail(Request $request, PatientVisit $visit): JsonResponse
    {
        $visit->loadMissing([
            'patient',
            'service',
            'assignedDentist',
            'visitNotes.createdBy',
            'visitNotes.updatedBy',
        ]);

        if ($visit->visitNotes && $request->user()) {
            $visit->visitNotes->recordAccess($request->user()->id);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'visit' => [
                    'id' => $visit->id,
                    'visit_code' => $visit->visit_code,
                    'patient_id' => $visit->patient_id,
                    'patient_name' => trim($visit->patient?->first_name . ' ' . $visit->patient?->last_name),
                    'visit_date' => optional($visit->visit_date)->toDateString(),
                    'start_time' => optional($visit->start_time)->toDateTimeString(),
                    'end_time' => optional($visit->end_time)->toDateTimeString(),
                    'status' => $visit->status,
                    'service' => [
                        'id' => $visit->service?->id,
                        'name' => $visit->service?->name,
                    ],
                    'dentist' => [
                        'id' => $visit->dentist_schedule_id,
                        'name' => $visit->assignedDentist?->dentist_name,
                        'code' => $visit->assignedDentist?->dentist_code,
                        'email' => $visit->assignedDentist?->email,
                    ],
                ],
                'notes' => $visit->visitNotes ? [
                    'dentist_notes' => $visit->visitNotes->dentist_notes_encrypted,
                    'findings' => $visit->visitNotes->findings_encrypted,
                    'treatment_plan' => $visit->visitNotes->treatment_plan_encrypted,
                    'teeth_treated' => $visit->visitNotes->teeth_treated,
                    'updated_at' => optional($visit->visitNotes->updated_at)?->toDateTimeString(),
                    'created_at' => optional($visit->visitNotes->created_at)?->toDateTimeString(),
                    'created_by' => $visit->visitNotes->createdBy?->only(['id', 'name', 'email']),
                    'updated_by' => $visit->visitNotes->updatedBy?->only(['id', 'name', 'email']),
                ] : null,
            ],
        ]);
    }

    private function formatPatientSummary(Patient $patient): array
    {
        return [
            'id' => $patient->id,
            'patient_code' => sprintf('P-%05d', $patient->id),
            'full_name' => trim("{$patient->first_name} {$patient->last_name}"),
            'first_name' => $patient->first_name,
            'last_name' => $patient->last_name,
            'sex' => $patient->sex,
            'contact_number' => $patient->contact_number,
            'age' => $patient->birthdate ? $patient->birthdate->age : null,
            'has_user_account' => (bool) $patient->user,
        ];
    }

    private function formatPatientProfile(Patient $patient): array
    {
        return [
            'id' => $patient->id,
            'patient_code' => sprintf('P-%05d', $patient->id),
            'first_name' => $patient->first_name,
            'last_name' => $patient->last_name,
            'middle_name' => $patient->middle_name,
            'full_name' => trim("{$patient->first_name} {$patient->last_name}"),
            'birthdate' => $patient->birthdate?->toDateString(),
            'age' => $patient->birthdate ? $patient->birthdate->age : null,
            'sex' => $patient->sex,
            'contact_number' => $patient->contact_number,
            'address' => $patient->address,
            'archived_at' => $patient->archived_at?->toDateTimeString(),
            'user' => $patient->user ? [
                'id' => $patient->user->id,
                'name' => $patient->user->name,
                'email' => $patient->user->email,
                'status' => $patient->user->status,
            ] : null,
        ];
    }
}

