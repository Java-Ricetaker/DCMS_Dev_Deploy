<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Patient;
use App\Services\SystemLogService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Auth;

class ArchivedPatientController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $perPage = (int) $request->input('per_page', 15);
        $perPage = max(1, min($perPage, 100));

        $query = Patient::query()
            ->whereNotNull('archived_at')
            ->with([
                'user:id,name,email,contact_number,role,status',
                'latestCompletedVisit:id,patient_id,visit_date',
                'archivedBy:id,name,email',
            ])
            ->orderByDesc('archived_at');

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('first_name', 'like', "%{$search}%")
                    ->orWhere('last_name', 'like', "%{$search}%")
                    ->orWhere('middle_name', 'like', "%{$search}%")
                    ->orWhereHas('user', function ($uq) use ($search) {
                        $uq->where('email', 'like', "%{$search}%")
                            ->orWhere('name', 'like', "%{$search}%");
                    });
            });
        }

        if ($request->filled('archived_before')) {
            $query->whereDate('archived_at', '<=', $request->date('archived_before'));
        }

        if ($request->filled('archived_after')) {
            $query->whereDate('archived_at', '>=', $request->date('archived_after'));
        }

        $paginator = $query->paginate($perPage);

        $paginator->getCollection()->transform(function (Patient $patient) {
            return [
                'id' => $patient->id,
                'first_name' => $patient->first_name,
                'last_name' => $patient->last_name,
                'middle_name' => $patient->middle_name,
                'email' => $patient->user?->email,
                'contact_number' => $patient->contact_number,
                'archived_at' => optional($patient->archived_at)->toDateTimeString(),
                'archived_reason' => $patient->archived_reason,
                'archived_by' => $patient->archivedBy?->only(['id', 'name', 'email']),
                'last_visit_date' => optional($patient->latestCompletedVisit?->visit_date)->toDateString(),
                'user' => $patient->user,
            ];
        });

        return response()->json($paginator);
    }

    public function reactivate(Request $request, Patient $patient): JsonResponse
    {
        if (is_null($patient->archived_at)) {
            return response()->json([
                'status' => 'error',
                'message' => 'Patient is not archived.',
            ], 422);
        }

        $patient->forceFill([
            'archived_at' => null,
            'archived_by' => null,
            'archived_reason' => null,
        ])->save();

        SystemLogService::logPatient(
            'reactivated',
            $patient->id,
            sprintf('Patient account reactivated by %s', $request->user()->name),
            [
                'patient_id' => $patient->id,
                'reactivated_by' => $request->user()->only(['id', 'name', 'email']),
            ]
        );

        return response()->json([
            'status' => 'success',
            'message' => 'Patient account reactivated.',
            'patient' => $patient->load('user'),
        ]);
    }
}

