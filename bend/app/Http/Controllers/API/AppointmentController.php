<?php

namespace App\Http\Controllers\API;

use Carbon\Carbon;
use App\Models\Patient;
use App\Models\Service;
use App\Models\SystemLog;
use App\Models\Appointment;
use App\Models\Payment;
use App\Models\AppSetting;
use App\Models\PolicyHistory;
use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;
use Illuminate\Validation\Rule;
use App\Helpers\NotificationService;
use App\Http\Controllers\Controller;
use App\Services\ClinicDateResolverService;
use App\Services\NotificationService as SystemNotificationService;
use App\Services\PatientManagerService;
use App\Services\SystemLogService;
use App\Services\AppointmentCancellationService;
use App\Services\PreferredDentistService;
use App\Helpers\IpHelper;
use App\Models\PatientManager;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Auth;

class AppointmentController extends Controller
{
    public function store(Request $request, ClinicDateResolverService $resolver)
{
    $validated = $request->validate([
        'service_id'      => ['required', 'exists:services,id'],
        'date'            => ['required', 'date_format:Y-m-d', 'after:today'],
        // accept HH:MM or HH:MM:SS
        'start_time'      => ['required', 'regex:/^\d{2}:\d{2}(:\d{2})?$/'],
        'payment_method'  => ['required', Rule::in(['cash', 'maya', 'hmo'])],
        // NEW: optional, required when payment_method = hmo
        'patient_hmo_id'  => ['nullable', 'integer', 'exists:patient_hmos,id'],
        // NEW: optional, for per-teeth services
        'teeth_count'     => ['nullable', 'integer', 'min:1', 'max:32'],
        'honor_preferred_dentist' => ['sometimes', 'boolean'],
    ]);

    $service  = Service::findOrFail($validated['service_id']);
    
    // Calculate estimated minutes based on teeth count for per-teeth services
    $estimatedMinutes = $service->calculateEstimatedMinutes($validated['teeth_count'] ?? null);
    $blocksNeeded = (int) max(1, ceil($estimatedMinutes / 30));
    $dateStr  = $validated['date'];
    $date     = Carbon::createFromFormat('Y-m-d', $dateStr)->startOfDay();

    $startRaw = $validated['start_time'];
    $startTime = Carbon::createFromFormat('H:i', $this->normalizeTime($startRaw));

    // booking window check (tomorrow .. +7)
    $today = now()->startOfDay();
    if ($date->lte($today) || $date->gt($today->copy()->addDays(7))) {
        return response()->json(['message' => 'Date is outside the booking window.'], 422);
    }

    // resolve day snapshot
    $snap = $resolver->resolve($date);
    if (!$snap['is_open']) {
        return response()->json(['message' => 'Clinic is closed on this date.'], 422);
    }

    $open = Carbon::parse($snap['open_time']);
    $close = Carbon::parse($snap['close_time']);
    // ensure start is in the 30-min grid and inside hours
    $grid = ClinicDateResolverService::buildBlocks($snap['open_time'], $snap['close_time']);
    if (!in_array($startTime->format('H:i'), $grid, true)) {
        return response()->json(['message' => 'Invalid start time (not on grid or outside hours).'], 422);
    }

    // Calculate end time using 30-minute blocks (round up to nearest 30 minutes)
    $endTime = $startTime->copy()->addMinutes($blocksNeeded * 30);
    if ($startTime->lt($open) || $endTime->gt($close)) {
        return response()->json(['message' => 'Selected time is outside clinic hours.'], 422);
    }

    // resolve booking patient by the authenticated user
    $patient = Patient::byUser(Auth::id());
    if (!$patient) {
        return response()->json([
            'message' => 'Your account is not yet linked to a patient record. Please contact the clinic.',
        ], 422);
    }

    if ($response = $this->ensurePolicyAccepted($patient)) {
        return $response;
    }

    // Check if patient is blocked from booking appointments
    $userIp = IpHelper::getRealIpAddress($request);
    $blockInfo = PatientManagerService::getPatientBlockInfo($patient->id, $userIp);
    
    if ($blockInfo['blocked']) {
        $message = self::getBlockedPatientMessage($blockInfo);
        return response()->json([
            'message' => $message,
            'blocked' => true,
            'block_type' => $blockInfo['block_type'],
            'block_reason' => $blockInfo['block_reason'],
        ], 403);
    }

    // Check if patient has warning status - only allow Maya payment
    $patientManager = PatientManager::where('patient_id', $patient->id)->first();
    if ($patientManager && $patientManager->isUnderWarning()) {
        // Only allow Maya payment method for warning status
        if ($validated['payment_method'] !== 'maya') {
            return response()->json([
                'message' => '⚠️ PAYMENT RESTRICTION\n\nYour account is under warning due to previous no-shows. You can only book appointments using Maya (online payment) at this time.\n\nPlease select Maya as your payment method or visit our clinic in person for walk-in services.',
                'warning_status' => true,
                'allowed_payment_methods' => ['maya'],
            ], 422);
        }
    }

    $honorPreferredRequested = $request->has('honor_preferred_dentist')
        ? $request->boolean('honor_preferred_dentist')
        : true;

    /** @var \App\Models\DentistSchedule|null $preferredDentist */
    $preferredDentist = null;
    $preferredDentistId = null;
    if ($patient) {
        /** @var PreferredDentistService $preferredDentistService */
        $preferredDentistService = app(PreferredDentistService::class);
        $preferredDentist = $preferredDentistService->resolveForPatient($patient->id, $date);
        $preferredDentistId = $preferredDentist?->id;
    }

    $capCheck = $this->checkCapacity($service, $dateStr, $startTime->format('H:i'), [
        'preferred_dentist_id' => $preferredDentistId,
        'requested_honor_preferred' => $honorPreferredRequested,
    ]);

    if (!$capCheck['ok']) {
        $message = $capCheck['message'] ?? null;
        if (!$message) {
            $fullAt = $capCheck['full_at'] ?? $startTime->format('H:i');
            $message = "Time slot starting at {$fullAt} is already full.";
        }
        return response()->json(['message' => $message], 422);
    }

    $assignedDentistId = $capCheck['assigned_dentist_id'] ?? null;

    // Check for overlapping appointments for the same patient
    $timeSlot = $this->normalizeTime($startTime) . '-' . $this->normalizeTime($endTime);
    if (Appointment::hasOverlappingAppointment($patient->id, $dateStr, $timeSlot)) {
        return response()->json([
            'message' => 'You already have an appointment at this time. Please choose a different time slot.',
        ], 422);
    }

    // HMO consistency checks
    $patientHmoId = $request->input('patient_hmo_id'); // may be null

    if ($validated['payment_method'] === 'hmo') {
        if (!$patientHmoId) {
            return response()->json(['message' => 'Please select an HMO for this appointment.'], 422);
        }
        // must belong to this patient
        $hmo = DB::table('patient_hmos')->where('id', $patientHmoId)->first();
        if (!$hmo || (int)$hmo->patient_id !== (int)$patient->id) {
            return response()->json(['message' => 'Selected HMO does not belong to this patient.'], 422);
        }
        // HMO validation - since we removed date fields, we just verify the HMO exists and belongs to patient
    } else {
        // if not HMO, ignore any stray patient_hmo_id
        $patientHmoId = null;
    }

    // create appointment
    $timeSlot = $this->normalizeTime($startTime) . '-' . $this->normalizeTime($endTime);
    $referenceCode = strtoupper(Str::random(8));

    $appointment = Appointment::create([
        'patient_id'      => $patient->id,
        'service_id'      => $service->id,
        'patient_hmo_id'  => $patientHmoId, // NEW
        'date'            => $dateStr,
        'time_slot'       => $timeSlot,
        'reference_code'  => $referenceCode,
        'status'          => 'pending',
        'payment_method'  => $validated['payment_method'],
        'payment_status'  => $validated['payment_method'] === 'maya' ? 'awaiting_payment' : 'unpaid',
        'teeth_count'     => $validated['teeth_count'] ?? null, // NEW
        'dentist_schedule_id' => $assignedDentistId,
        'honor_preferred_dentist' => $honorPreferredRequested,
    ]);

    // Notify staff about the new appointment
    SystemNotificationService::notifyNewAppointment($appointment);

    // Log appointment creation
    SystemLogService::logAppointment(
        'created',
        $appointment->id,
        "New appointment booked: {$patient->first_name} {$patient->last_name} for {$service->name}",
        [
            'appointment_id' => $appointment->id,
            'reference_code' => $appointment->reference_code,
            'patient_id' => $patient->id,
            'patient_name' => $patient->first_name . ' ' . $patient->last_name,
            'service_id' => $service->id,
            'service_name' => $service->name,
            'date' => $dateStr,
            'time_slot' => $timeSlot,
            'payment_method' => $validated['payment_method'],
            'status' => 'pending',
            'dentist_schedule_id' => $assignedDentistId,
            'honor_preferred_dentist' => $honorPreferredRequested,
        ]
    );

    return response()->json([
        'message'        => 'Appointment booked.',
        'reference_code' => $appointment->reference_code,
        'appointment'    => $appointment
    ], 201);
}




    // Optional: Add list(), cancel(), approve(), reject() here later

    public function approve($id)
    {
        $appointment = Appointment::findOrFail($id);

        if ($appointment->status !== 'pending') {
            return response()->json(['error' => 'Appointment already processed.'], 422);
        }

        // Enforce capacity on approval
        $start = $appointment->time_slot && strpos($appointment->time_slot, '-') !== false
            ? trim(explode('-', $appointment->time_slot, 2)[0])
            : null;

        if ($start) {
            $capCheck = $this->checkCapacity($appointment->service, $appointment->date, $start, [
                'exclude_appointment_id' => $appointment->id,
                'preferred_dentist_id' => $appointment->dentist_schedule_id,
                'requested_honor_preferred' => $appointment->honor_preferred_dentist,
                'force_dentist_id' => $appointment->dentist_schedule_id,
            ]);
            if (!$capCheck['ok']) {
                $message = $capCheck['message'] ?? 'Cannot approve: slot is fully booked.';
                SystemLogService::logAppointment(
                    'approve_failed_capacity',
                    $appointment->id,
                    'Staff ' . Auth::user()->name . ' attempted to approve appointment #' . $appointment->id . ' but slot is full',
                    [
                        'appointment_id' => $appointment->id,
                        'date' => $appointment->date,
                        'time_slot' => $appointment->time_slot,
                    ]
                );
                return response()->json(['message' => $message], 422);
            }

            if (!$appointment->dentist_schedule_id && !empty($capCheck['assigned_dentist_id'])) {
                $appointment->dentist_schedule_id = $capCheck['assigned_dentist_id'];
            }
        }

        $from = $appointment->status;
        $appointment->status = 'approved';
        $appointment->save();

        // Notify patient about appointment approval
        SystemNotificationService::notifyAppointmentStatusChange($appointment, 'approved');

        // Log appointment approval
        SystemLogService::logAppointment(
            'approved',
            $appointment->id,
            'Staff ' . Auth::user()->name . ' approved appointment #' . $appointment->id,
            [
                'appointment_id' => $appointment->id,
                'patient_id' => $appointment->patient_id,
                'service_id' => $appointment->service_id,
                'date' => $appointment->date,
                'time_slot' => $appointment->time_slot
            ]
        );

        return response()->json(['message' => 'Appointment approved.']);
    }

    public function reject(Request $request, $id)
    {
        $appointment = Appointment::findOrFail($id);

        if ($appointment->status !== 'pending') {
            return response()->json(['error' => 'Appointment already processed.'], 422);
        }

        $validated = $request->validate([
            'note' => 'required|string|max:1000',
            'cancellation_reason' => 'nullable|in:patient_request,admin_cancellation,health_safety_concern,clinic_cancellation,medical_contraindication,other',
            'treatment_adjustment_notes' => 'nullable|string|max:1000',
        ]);

        $from = $appointment->status;
        $appointment->status = 'rejected';
        $appointment->notes = $validated['note'];
        // Default to health_safety_concern for rejections, but allow override
        $appointment->cancellation_reason = $validated['cancellation_reason'] ?? Appointment::CANCELLATION_REASON_HEALTH_SAFETY_CONCERN;
        $appointment->treatment_adjustment_notes = $validated['treatment_adjustment_notes'] ?? null;
        
        // Update payment status to unpaid for rejected appointments
        $appointment->payment_status = 'unpaid';
        $appointment->save();

        // Cancel any existing Maya payments for this appointment
        if ($appointment->payment_method === 'maya') {
            $mayaPayments = Payment::where('appointment_id', $appointment->id)
                ->where('method', 'maya')
                ->whereIn('status', ['unpaid', 'awaiting_payment'])
                ->get();
            
            foreach ($mayaPayments as $payment) {
                $payment->update([
                    'status' => 'cancelled',
                    'cancelled_at' => now(),
                ]);
            }
        }

        // Notify patient about appointment rejection
        SystemNotificationService::notifyAppointmentStatusChange($appointment, 'rejected');

        // Log appointment rejection
        SystemLogService::logAppointment(
            'rejected',
            $appointment->id,
            'Staff ' . Auth::user()->name . ' rejected appointment #' . $appointment->id . ' - Reason: ' . $request->note,
            [
                'appointment_id' => $appointment->id,
                'patient_id' => $appointment->patient_id,
                'service_id' => $appointment->service_id,
                'date' => $appointment->date,
                'time_slot' => $appointment->time_slot,
                'rejection_note' => $request->note
            ]
        );

        return response()->json(['message' => 'Appointment rejected.']);
    }

    public function index(Request $request)
    {
        $query = Appointment::with(['service', 'patient', 'refundRequest']);

        // Optional filter by status
        if ($request->has('status')) {
            $query->where('status', $request->status);
        }

        // Optional filter by patient_id (for appointment finder)
        if ($request->has('patient_id')) {
            $query->where('patient_id', $request->patient_id);
        }

        // Optional filter by date range (future-proofing)
        if ($request->has('start_date') && $request->has('end_date')) {
            $query->whereBetween('date', [$request->start_date, $request->end_date]);
        }

        return response()->json($query->orderByDesc('created_at')->get());
    }

    public function userAppointments(Request $request)
    {
        $user = $request->user();

        if (!$user->patient) {
            return response()->json([
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'total' => 0,
                    'per_page' => 10,
                ]
            ]);
        }

        $query = Appointment::with(['service', 'payments', 'refundRequest'])
            ->where('patient_id', $user->patient->id)
            ->where('status', '!=', 'completed');

        // Date filtering
        if ($request->has('start_date')) {
            if ($request->has('end_date')) {
                // Filter between start_date and end_date (inclusive)
                $query->whereBetween('date', [$request->start_date, $request->end_date]);
            } else {
                // Filter only for start_date (exact match)
                $query->where('date', $request->start_date);
            }
        }

        $appointments = $query->latest('date')->paginate(10);

        // Log the appointments data for debugging
        Log::info('Patient Appointments API Response', [
            'patient_id' => $user->patient->id,
            'appointments_count' => $appointments->count(),
            'filters' => [
                'start_date' => $request->start_date,
                'end_date' => $request->end_date,
            ],
            'appointments' => $appointments->getCollection()->map(function ($appointment) {
                return [
                    'id' => $appointment->id,
                    'payment_status' => $appointment->payment_status,
                    'status' => $appointment->status,
                    'payment_method' => $appointment->payment_method,
                    'payments_count' => $appointment->payments->count(),
                    'total_paid' => $appointment->payments->sum('amount_paid')
                ];
            })->toArray()
        ]);

        return response()->json($appointments);
    }

    public function userVisitHistory(Request $request)
    {
        $user = $request->user();

        if (!$user->patient) {
            return response()->json([
                'data' => [],
                'meta' => [
                    'current_page' => 1,
                    'last_page' => 1,
                    'total' => 0,
                    'per_page' => 10,
                ]
            ]);
        }

        // Get completed patient visits with visit notes
        $query = \App\Models\PatientVisit::with(['service', 'visitNotes', 'additionalCharges.inventoryItem'])
            ->where('patient_id', $user->patient->id)
            ->where('status', 'completed');

        // Date filtering
        if ($request->has('start_date')) {
            if ($request->has('end_date')) {
                // Filter between start_date and end_date (inclusive)
                $query->whereBetween('visit_date', [$request->start_date, $request->end_date]);
            } else {
                // Filter only for start_date (exact match)
                $query->where('visit_date', $request->start_date);
            }
        }

        $visits = $query->latest('visit_date')->paginate(10);

        // Transform the data to include service name and teeth treated
        $transformedVisits = $visits->getCollection()->map(function ($visit) {
            return [
                'id' => $visit->id,
                'visit_date' => $visit->visit_date->format('Y-m-d'),
                'service_name' => $visit->service?->name,
                'teeth_treated' => $visit->visitNotes?->teeth_treated,
                'teeth_type' => $visit->visitNotes?->teeth_type,
                'is_primary_teeth' => $visit->visitNotes?->is_primary_teeth,
                'teeth_treated_with_count' => $visit->visitNotes?->teeth_treated_with_count,
                'created_at' => $visit->created_at,
                'dentist_notes' => $visit->visitNotes?->dentist_notes ?? '',
                'findings' => $visit->visitNotes?->findings ?? '',
                'treatment_plan' => $visit->visitNotes?->treatment_plan ?? '',
                'receipt_available' => $visit->status === 'completed',
            ];
        });

        return response()->json([
            'data' => $transformedVisits,
            'meta' => [
                'current_page' => $visits->currentPage(),
                'last_page' => $visits->lastPage(),
                'total' => $visits->total(),
                'per_page' => $visits->perPage(),
            ]
        ]);
    }

    public function cancel(Request $request, $id)
    {
        $user = Auth::user();
        $isAdmin = ($user->role ?? null) === 'admin';

        // Validate request (fields are optional)
        $validated = $request->validate([
            'cancellation_reason' => 'nullable|in:patient_request,admin_cancellation,health_safety_concern,clinic_cancellation,medical_contraindication,other',
            'treatment_adjustment_notes' => 'nullable|string|max:1000',
        ]);

        // Admin can cancel any appointment, patients can only cancel their own
        if ($isAdmin) {
            $appointment = Appointment::find($id);
            if (!$appointment) {
                return response()->json(['message' => 'Appointment not found.'], 404);
            }
            $reason = 'Cancelled by admin';
            $defaultReason = Appointment::CANCELLATION_REASON_ADMIN_CANCELLATION;
        } else {
            if (!$user->patient) {
                return response()->json(['message' => 'Not linked to patient profile.'], 403);
            }

            $appointment = Appointment::where('id', $id)
                ->where('patient_id', $user->patient->id)
                ->first();

            if (!$appointment) {
                return response()->json(['message' => 'Appointment not found.'], 404);
            }
            $reason = 'Cancelled by patient';
            $defaultReason = Appointment::CANCELLATION_REASON_PATIENT_REQUEST;
        }

        // Allow cancellation if:
        // 1. Status is pending OR
        // 2. Status is approved AND (payment status is unpaid/awaiting_payment OR admin is cancelling)
        $canCancel = $appointment->status === 'pending' || 
                     ($appointment->status === 'approved' && 
                      (in_array($appointment->payment_status, ['unpaid', 'awaiting_payment', 'paid']) || $isAdmin));

        if (!$canCancel) {
            return response()->json(['message' => 'This appointment cannot be canceled. Only pending appointments or approved appointments can be canceled.'], 422);
        }

        /** @var AppointmentCancellationService $cancellationService */
        $cancellationService = app(AppointmentCancellationService::class);

        $result = $cancellationService->cancel($appointment, [
            'reason' => $reason,
            'requested_cancellation_reason' => $validated['cancellation_reason'] ?? null,
            'default_cancellation_reason' => $defaultReason,
            'treatment_adjustment_notes' => $validated['treatment_adjustment_notes'] ?? null,
            'actor_role' => $isAdmin ? 'admin' : 'patient',
            'actor_id' => $user->id ?? null,
            'actor_name' => $user->name ?? null,
            'notify' => true,
        ]);

        return response()->json([
            'message' => 'Appointment canceled.',
            'refund_request_created' => $result['refund_request_created'],
        ]);
    }

    public function remindable()
    {
        $start = now()->addDays(1)->toDateString();
        $end = now()->addDays(2)->toDateString();

        $appointments = Appointment::with('patient.user', 'service')
            ->whereBetween('date', [$start, $end])
            ->where('status', 'approved')
            ->whereNull('reminded_at')
            ->get();

        return response()->json($appointments);
    }


    public function sendReminder(Request $request, $id)
    {
        return DB::transaction(function () use ($request, $id) {
            // Use lockForUpdate() to acquire a row-level lock, preventing concurrent access
            $appointment = Appointment::with('patient.user', 'service')
                ->where('id', $id)
                ->lockForUpdate()
                ->firstOrFail();

            $d1 = now()->addDays(1)->toDateString();
            $d2 = now()->addDays(2)->toDateString();

            // Check eligibility (status, date, and reminded_at)
            if (
                $appointment->status !== 'approved' ||
                !in_array($appointment->date, [$d1, $d2], true) ||   // ⬅ allow +1 or +2
                $appointment->reminded_at !== null
            ) {
                return response()->json(['message' => 'Not eligible for reminder.'], 422);
            }

            $user = $appointment->patient->user;
            if (!$user) {
                return response()->json(['message' => 'Patient has no linked user account.'], 422);
            }

            // Prepare message and phone number
            $message = $request->input('message', '');
            $edited = (bool) $request->input('edited', false);

            // Convert phone number to E.164 format if needed
            $phoneNumber = $user->contact_number;
            if ($phoneNumber && preg_match('/^09([0-9]{9})$/', $phoneNumber, $matches)) {
                $phoneNumber = '+639' . $matches[1];
            }

            // Atomic update: set reminded_at only if it's currently null
            // This ensures only the first concurrent request succeeds
            $updated = Appointment::where('id', $id)
                ->whereNull('reminded_at')
                ->update(['reminded_at' => now()]);

            // If update affected 0 rows, another request already sent the SMS
            if ($updated === 0) {
                return response()->json(['message' => 'Reminder already sent.'], 422);
            }

            // Send SMS only after successfully acquiring the lock and updating
            NotificationService::send(
                to: $phoneNumber,
                subject: 'Dental Appointment Reminder',
                message: $message
            );

            if ($edited) {
                // Log custom reminder
                SystemLogService::logAppointment(
                    'reminder_sent_custom',
                    $appointment->id,
                    'Staff ' . Auth::user()->name . ' sent a custom reminder for appointment #' . $appointment->id,
                    [
                        'appointment_id' => $appointment->id,
                        'patient_id' => $appointment->patient_id,
                        'custom_message' => $message
                    ]
                );
            }

            return response()->json(['message' => 'Reminder sent.']);
        });
    }


    public function resolveReferenceCode($code)
    {
        $normalized = $this->normalizeRef($code);

        $appointment = Appointment::with(['service', 'patient'])
            ->whereRaw('UPPER(reference_code) = ?', [$normalized])
            ->where('status', 'approved')
            // ->whereDate('date', now()->toDateString()) // optional: enable later
            ->first();

        if (!$appointment) {
            return response()->json(['message' => 'Invalid or used reference code.'], 404);
        }

        // Get patient's last visit information
        $lastVisit = \App\Models\PatientVisit::where('patient_id', $appointment->patient_id)
            ->where('status', 'completed')
            ->with(['service', 'visitNotes'])
            ->orderBy('visit_date', 'desc')
            ->first();

        $responseData = [
            'id' => $appointment->id,
            'patient_name' => $appointment->patient->first_name . ' ' . $appointment->patient->last_name,
            'service_name' => $appointment->service->name,
            'date' => $appointment->date,
            'time_slot' => $appointment->time_slot,
        ];

        // Add last visit information if available
        if ($lastVisit) {
            $responseData['last_visit'] = [
                'visit_date' => $lastVisit->visit_date,
                'service_name' => $lastVisit->service?->name,
                'has_notes' => $lastVisit->visitNotes ? true : false,
                'notes_created_at' => $lastVisit->visitNotes?->created_at,
                'teeth_treated' => $lastVisit->visitNotes?->teeth_treated,
                'teeth_type' => $lastVisit->visitNotes?->teeth_type,
                'is_primary_teeth' => $lastVisit->visitNotes?->is_primary_teeth,
                'teeth_treated_with_count' => $lastVisit->visitNotes?->teeth_treated_with_count,
            ];
        } else {
            $responseData['last_visit'] = null;
        }

        return response()->json($responseData);
    }


    // Normalize staff-entered code (strip spaces/dashes, uppercase)
    protected function normalizeRef(string $code): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $code));
    }

    /**
     * Staff-only exact resolver.
     * GET /api/appointments/resolve-exact?code=XXXXYYYY
     */
    public function resolveExact(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'size:8'], // adjust size if your codes differ
        ]);

        $code = $this->normalizeRef($data['code']);

        $appointment = Appointment::with(['service', 'patient.user'])
            ->whereRaw('UPPER(reference_code) = ?', [$code])
            ->first();

        if (!$appointment) {
            return response()->json(['message' => 'No appointment found for that code'], 404);
        }

        // Optional: only allow certain statuses
        // if (!in_array($appointment->status, ['pending','approved'])) {
        //     return response()->json(['message' => 'Appointment not actionable'], 422);
        // }

        // Log reference code lookup
        SystemLogService::logAppointment(
            'resolve_by_code',
            $appointment->id,
            'Staff ' . Auth::user()->name . ' looked up appointment by reference code: ' . $code,
            [
                'reference_code' => $code,
                'appointment_id' => $appointment->id,
                'patient_id' => $appointment->patient_id
            ]
        );

        return response()->json($appointment);
    }

    private function normalizeTime(Carbon|string $time): string
    {
        if ($time instanceof Carbon) {
            return $time->format('H:i');
        }
        // handles "HH:MM" or "HH:MM:SS"
        return Carbon::createFromFormat(strlen($time) === 8 ? 'H:i:s' : 'H:i', $time)->format('H:i');
    }

    private function ensurePolicyAccepted(Patient $patient): ?JsonResponse
    {
        $activePolicyId = AppSetting::get('policy.active_history_id');
        if (!$activePolicyId) {
            return null;
        }

        if ((int) $patient->policy_history_id === (int) $activePolicyId) {
            return null;
        }

        $policy = PolicyHistory::find($activePolicyId);

        return response()->json([
            'message' => "Please review and accept the updated Terms & Privacy Policy before continuing.",
            'policy_acceptance_required' => true,
            'policy_history_id' => $policy?->id ?? (int) $activePolicyId,
            'policy_effective_date' => $policy?->effective_date?->format('Y-m-d'),
        ], 409);
    }

    private function checkCapacity(Service $service, string $dateStr, string $startRaw, $options = []): array
    {
        if (!is_array($options)) {
            $options = ['exclude_appointment_id' => $options];
        }

        $excludeAppointmentId = $options['exclude_appointment_id'] ?? null;
        $preferredDentistId = $options['preferred_dentist_id'] ?? null;
        $requestedHonorPreferred = $options['requested_honor_preferred'] ?? true;
        $forceDentistId = $options['force_dentist_id'] ?? null;

        $date = Carbon::createFromFormat('Y-m-d', $dateStr)->startOfDay();
        $startNormalized = $this->normalizeTime($startRaw);
        $startTime = Carbon::createFromFormat('H:i', $startNormalized);

        /** @var ClinicDateResolverService $resolver */
        $resolver = app(ClinicDateResolverService::class);
        $snap = $resolver->resolve($date);

        if (!$snap['is_open']) {
            return [
                'ok' => false,
                'reason' => 'closed',
                'message' => 'Clinic is closed on this date.',
                'snap' => $snap,
            ];
        }

        $blocks = ClinicDateResolverService::buildBlocks($snap['open_time'], $snap['close_time']);
        if (!in_array($startNormalized, $blocks, true)) {
            return [
                'ok' => false,
                'reason' => 'invalid_start_time',
                'message' => 'Invalid start time (not on grid or outside hours).',
                'snap' => $snap,
            ];
        }

        $blocksNeeded = (int) max(1, ceil(($service->estimated_minutes ?? 30) / 30));
        $effectiveCapacity = (int) $snap['effective_capacity'];

        $globalUsage = Appointment::slotUsageForDate($dateStr, $blocks, $excludeAppointmentId);
        $dentistUsage = Appointment::dentistSlotUsageForDate($dateStr, $excludeAppointmentId);

        // Global capacity check
        $globalCursor = $startTime->copy();
        for ($i = 0; $i < $blocksNeeded; $i++) {
            $blockKey = $globalCursor->format('H:i');
            if (!array_key_exists($blockKey, $globalUsage) || $globalUsage[$blockKey] >= $effectiveCapacity) {
                return [
                    'ok' => false,
                    'full_at' => $blockKey,
                    'message' => "Time slot starting at {$blockKey} is already full.",
                    'snap' => $snap,
                ];
            }
            $globalCursor->addMinutes(30);
        }
        $endTime = $globalCursor->copy();

        $activeDentistIds = $snap['active_dentist_ids'] ?? [];
        $preferredDentistActive = $preferredDentistId && in_array($preferredDentistId, $activeDentistIds, true);
        $effectiveHonorPreferred = $requestedHonorPreferred && $preferredDentistId && $preferredDentistActive;

        if ($forceDentistId) {
            $candidateDentistIds = [$forceDentistId];
            $effectiveHonorPreferred = false;
        } elseif ($effectiveHonorPreferred) {
            $candidateDentistIds = [$preferredDentistId];
        } else {
            $candidateDentistIds = $activeDentistIds;
        }

        $assignedDentistId = null;
        foreach ($candidateDentistIds as $candidateId) {
            if (!$candidateId) {
                continue;
            }
            if (!in_array($candidateId, $activeDentistIds, true)) {
                continue;
            }
            if ($this->dentistHasCapacity($dentistUsage, $candidateId, $startTime, $blocksNeeded)) {
                $assignedDentistId = $candidateId;
                break;
            }
        }

        if ($effectiveHonorPreferred && !$assignedDentistId) {
            return [
                'ok' => false,
                'reason' => 'preferred_dentist_conflict',
                'message' => 'Your preferred dentist is already booked for this time. Please choose another slot.',
                'snap' => $snap,
            ];
        }

        return [
            'ok' => true,
            'assigned_dentist_id' => $assignedDentistId,
            'effective_honor_preferred' => $effectiveHonorPreferred,
            'requested_honor_preferred' => $requestedHonorPreferred,
            'snap' => $snap,
            'full_at' => null,
            'blocks_needed' => $blocksNeeded,
            'start_time' => $startTime,
            'end_time' => $endTime,
            'global_usage' => $globalUsage,
            'dentist_usage' => $dentistUsage,
        ];
    }

    private function dentistHasCapacity(array $dentistUsage, int $dentistId, Carbon $startTime, int $blocksNeeded): bool
    {
        $cursor = $startTime->copy();
        for ($i = 0; $i < $blocksNeeded; $i++) {
            $blockKey = $cursor->format('H:i');
            if (($dentistUsage[$dentistId][$blockKey] ?? 0) >= 1) {
                return false;
            }
            $cursor->addMinutes(30);
        }

        return true;
    }

    /**
     * POST /api/appointments/{id}/hmo/reveal
     * Body: { password: string }
     * Requires role admin|staff and correct current password
     * Returns decrypted HMO info for the appointment's patient_hmo_id
     */
    public function revealHmo(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['admin', 'staff'])) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $data = $request->validate([
            'password' => ['required', 'string'],
        ]);

        if (!\Illuminate\Support\Facades\Hash::check($data['password'], $user->password)) {
            return response()->json(['message' => 'Invalid password'], 401);
        }

        $appointment = Appointment::findOrFail($id);
        if (!$appointment->patient_hmo_id) {
            return response()->json(['message' => 'No HMO selected for this appointment'], 422);
        }

        $hmo = \App\Models\PatientHmo::findOrFail($appointment->patient_hmo_id);

        return response()->json([
            'provider_name' => $hmo->provider_name,
            'hmo_number'    => $hmo->hmo_number,
            'patient_fullname_on_card' => $hmo->patient_fullname_on_card,
        ]);
    }

    /**
     * POST /api/appointments/{id}/hmo/notify
     * Body: { message: string, coverage_amount?: number, approve?: boolean }
     */
    public function notifyHmoCoverage(Request $request, $id)
    {
        $user = $request->user();
        if (!$user || !in_array($user->role, ['admin', 'staff'])) {
            return response()->json(['message' => 'Forbidden'], 403);
        }

        $v = $request->validate([
            'message'         => ['required', 'string', 'max:1000'],
            'coverage_amount' => ['nullable', 'numeric', 'min:0'],
            'approve'         => ['sometimes', 'boolean'],
        ]);

        $appointment = Appointment::with(['patient', 'service'])->findOrFail($id);
        $patient = $appointment->patient;
        if (!$patient || !$patient->user_id) {
            return response()->json(['message' => 'Patient is not linked to a user'], 422);
        }

        $servicePrice = $appointment->service?->price ?? null;
        $coverage = isset($v['coverage_amount']) ? (float) $v['coverage_amount'] : null;
        $balance  = ($servicePrice !== null && $coverage !== null) ? max(0, (float)$servicePrice - $coverage) : null;

        $noteLines = [];
        $noteLines[] = '[HMO Review] ' . trim($v['message']);
        if ($coverage !== null) $noteLines[] = 'Coverage: ' . number_format($coverage, 2);
        if ($balance !== null) $noteLines[] = 'Estimated balance: ' . number_format($balance, 2);
        $appointment->notes = trim(implode("\n", array_filter($noteLines)));
        $appointment->save();

        DB::transaction(function () use ($user, $patient, $coverage, $balance, $v) {
            $noticeId = DB::table('notifications')->insertGetId([
                'type'            => 'hmo_coverage',
                'title'           => 'HMO Coverage Update',
                'body'            => $v['message'],
                'severity'        => 'info',
                'scope'           => 'targeted',
                'audience_roles'  => null,
                'effective_from'  => now(),
                'effective_until' => null,
                'data'            => json_encode([
                    'patient_id'      => $patient->id,
                    'coverage_amount' => $coverage,
                    'balance_due'     => $balance,
                    'by_user_id'      => $user->id,
                ]),
                'created_by'      => $user->id,
                'created_at'      => now(),
                'updated_at'      => now(),
            ]);

            DB::table('notification_targets')->upsert([
                [
                    'notification_id' => $noticeId,
                    'user_id'         => $patient->user_id,
                    'created_at'      => now(),
                    'updated_at'      => now(),
                ]
            ], ['notification_id','user_id'], []);
        });

        if (!empty($v['approve']) && $appointment->status === 'pending') {
            $appointment->status = 'approved';
            $appointment->save();
        }

        return response()->json([
            'message' => 'Coverage noted and patient notified',
            'balance_due' => $balance,
        ]);
    }

    /**
     * POST /api/appointments/{id}/reschedule
     * Body: { date: Y-m-d, start_time: HH:MM }
     * Allows rescheduling of paid Maya appointments to a new date/time
     */
    public function reschedule(Request $request, $id, ClinicDateResolverService $resolver)
    {
        $user = Auth::user();
        if (!$user->patient) {
            return response()->json(['message' => 'Not linked to patient profile.'], 403);
        }

        $appointment = Appointment::where('id', $id)
            ->where('patient_id', $user->patient->id)
            ->first();

        if (!$appointment) {
            return response()->json(['message' => 'Appointment not found.'], 404);
        }

        if ($response = $this->ensurePolicyAccepted($user->patient)) {
            return $response;
        }

        // Check eligibility: only paid Maya appointments can be rescheduled
        if ($appointment->payment_method !== 'maya' || $appointment->payment_status !== 'paid') {
            return response()->json(['message' => 'Only paid Maya appointments can be rescheduled.'], 422);
        }

        // Check appointment status - allow rescheduling of approved appointments
        if (!in_array($appointment->status, ['approved', 'pending'])) {
            return response()->json(['message' => 'This appointment cannot be rescheduled.'], 422);
        }

        $validated = $request->validate([
            'date' => ['required', 'date_format:Y-m-d', 'after:today'],
            'start_time' => ['required', 'regex:/^\d{2}:\d{2}(:\d{2})?$/'],
            'honor_preferred_dentist' => ['sometimes', 'boolean'],
        ]);

        $service = $appointment->service;
        $dateStr = $validated['date'];
        $date = Carbon::createFromFormat('Y-m-d', $dateStr)->startOfDay();

        $startRaw = $validated['start_time'];
        $startTime = Carbon::createFromFormat('H:i', $this->normalizeTime($startRaw));

        // Booking window check (tomorrow .. +7)
        $today = now()->startOfDay();
        if ($date->lte($today) || $date->gt($today->copy()->addDays(7))) {
            return response()->json(['message' => 'Date is outside the booking window.'], 422);
        }

        // Resolve day snapshot
        $snap = $resolver->resolve($date);
        if (!$snap['is_open']) {
            return response()->json(['message' => 'Clinic is closed on this date.'], 422);
        }

        $open = Carbon::parse($snap['open_time']);
        $close = Carbon::parse($snap['close_time']);

        // Ensure start is in the 30-min grid and inside hours
        $grid = ClinicDateResolverService::buildBlocks($snap['open_time'], $snap['close_time']);
        if (!in_array($startTime->format('H:i'), $grid, true)) {
            return response()->json(['message' => 'Invalid start time (not on grid or outside hours).'], 422);
        }

        // Calculate estimated minutes and blocks needed
        $estimatedMinutes = $service->calculateEstimatedMinutes($appointment->teeth_count ?? null);
        $blocksNeeded = (int) max(1, ceil($estimatedMinutes / 30));
        $endTime = $startTime->copy()->addMinutes($blocksNeeded * 30);

        if ($startTime->lt($open) || $endTime->gt($close)) {
            return response()->json(['message' => 'Selected time is outside clinic hours.'], 422);
        }

        $rescheduleHonorPreferred = $request->has('honor_preferred_dentist')
            ? $request->boolean('honor_preferred_dentist')
            : $appointment->honor_preferred_dentist;

        /** @var PreferredDentistService $preferredDentistService */
        $preferredDentistService = app(PreferredDentistService::class);
        $preferredDentist = $preferredDentistService->resolveForPatient($appointment->patient_id, $date);
        $preferredDentistId = $preferredDentist?->id;

        $capCheck = $this->checkCapacity($service, $dateStr, $startTime->format('H:i'), [
            'exclude_appointment_id' => $appointment->id,
            'preferred_dentist_id' => $preferredDentistId,
            'requested_honor_preferred' => $rescheduleHonorPreferred,
        ]);

        if (!$capCheck['ok']) {
            $message = $capCheck['message'] ?? null;
            if (!$message) {
                $fullAt = $capCheck['full_at'] ?? $startTime->format('H:i');
                $message = "Time slot starting at {$fullAt} is already full.";
            }
            return response()->json(['message' => $message], 422);
        }

        $assignedDentistId = $capCheck['assigned_dentist_id'] ?? null;
        if (isset($capCheck['end_time'])) {
            $endTime = $capCheck['end_time'];
        }

        // Check if patient is blocked from booking appointments
        $userIp = IpHelper::getRealIpAddress($request);
        $blockInfo = PatientManagerService::getPatientBlockInfo($appointment->patient_id, $userIp);
        
        if ($blockInfo['blocked']) {
            $message = self::getBlockedPatientMessage($blockInfo);
            return response()->json([
                'message' => $message,
                'blocked' => true,
                'block_type' => $blockInfo['block_type'],
                'block_reason' => $blockInfo['block_reason'],
            ], 403);
        }

        // Check for overlapping appointments for the same patient (excluding current appointment)
        $timeSlot = $this->normalizeTime($startTime) . '-' . $this->normalizeTime($endTime);
        $hasOverlap = Appointment::where('patient_id', $appointment->patient_id)
            ->where('id', '!=', $appointment->id)
            ->where('date', $dateStr)
            ->whereIn('status', ['pending', 'approved', 'completed'])
            ->get()
            ->filter(function ($apt) use ($timeSlot) {
                return Appointment::hasTimeSlotOverlap($apt->time_slot, $timeSlot);
            })
            ->isNotEmpty();

        if ($hasOverlap) {
            return response()->json([
                'message' => 'You already have an appointment at this time. Please choose a different time slot.',
            ], 422);
        }

        // Update the appointment
        $oldDate = $appointment->date;
        $oldTimeSlot = $appointment->time_slot;
        
        $timeSlot = $this->normalizeTime($startTime) . '-' . $this->normalizeTime($endTime);

        $appointment->date = $dateStr;
        $appointment->time_slot = $timeSlot;
        $appointment->status = 'pending'; // Reset to pending for staff approval
        $appointment->dentist_schedule_id = $assignedDentistId;
        $appointment->honor_preferred_dentist = $rescheduleHonorPreferred;
        $appointment->save();

        // Log the reschedule action
        SystemLogService::logAppointment(
            'rescheduled',
            $appointment->id,
            'Patient rescheduled appointment #' . $appointment->id . ' from ' . $oldDate . ' ' . $oldTimeSlot . ' to ' . $dateStr . ' ' . $timeSlot,
            [
                'appointment_id' => $appointment->id,
                'patient_id' => $user->patient->id,
                'service_id' => $appointment->service_id,
                'old_date' => $oldDate,
                'old_time_slot' => $oldTimeSlot,
                'new_date' => $dateStr,
                'new_time_slot' => $timeSlot,
                'dentist_schedule_id' => $assignedDentistId,
            ]
        );

        // Notify staff about the rescheduled appointment
        SystemNotificationService::notifyNewAppointment($appointment);

        return response()->json([
            'message' => 'Appointment rescheduled successfully. It will need staff approval.',
            'appointment' => $appointment->fresh(['service'])
        ]);
    }

    /**
     * Generate appropriate blocked patient message based on block type and reason
     */
    private static function getBlockedPatientMessage(array $blockInfo): string
    {
        $blockType = $blockInfo['block_type'];
        $blockReason = $blockInfo['block_reason'];
        $blockedAt = $blockInfo['blocked_at'];

        $baseMessage = '';
        $resolutionMessage = '';

        switch ($blockType) {
            case 'account':
                $baseMessage = "🚫 ACCOUNT BLOCKED\n\nYour account has been temporarily suspended from booking appointments";
                if ($blockReason) {
                    $baseMessage .= " due to:\n{$blockReason}";
                } else {
                    $baseMessage .= " due to multiple no-shows.";
                }
                $resolutionMessage = "\n\n🔧 TO RESOLVE:\n• Visit our clinic in person to discuss your account status\n• Bring a valid ID for verification\n• Speak with our staff to restore your booking privileges\n• You can still receive walk-in services";
                break;

            case 'ip':
                $baseMessage = "🌐 NETWORK BLOCKED\n\nYour current network/IP address has been blocked from booking appointments";
                if ($blockReason) {
                    $baseMessage .= " due to:\n{$blockReason}";
                } else {
                    $baseMessage .= " due to security concerns.";
                }
                $resolutionMessage = "\n\n🔧 TO RESOLVE:\n• Try connecting from a different network (mobile data, different WiFi)\n• Use a different device if available\n• If the issue persists, contact our clinic for assistance\n• You can still visit us in person for services";
                break;

            case 'both':
                $baseMessage = "🚫 ACCOUNT & NETWORK BLOCKED\n\nYour account and network have been blocked from booking appointments";
                if ($blockReason) {
                    $baseMessage .= " due to:\n{$blockReason}";
                } else {
                    $baseMessage .= " due to multiple no-shows and security concerns.";
                }
                $resolutionMessage = "\n\n🔧 TO RESOLVE:\n• First, try a different network (mobile data, different WiFi)\n• If that doesn't work, visit our clinic in person\n• Bring a valid ID and speak with our staff\n• We'll help restore your booking privileges\n• You can still receive walk-in services";
                break;

            default:
                $baseMessage = "🚫 BOOKING RESTRICTED\n\nYour account has been temporarily blocked from booking appointments due to multiple no-shows.";
                $resolutionMessage = "\n\n🔧 TO RESOLVE:\n• Visit our clinic in person to discuss your account status\n• Speak with our staff to restore your booking privileges\n• You can still receive walk-in services";
                break;
        }

        $contactMessage = "\n\n📞 Need help? Contact our clinic if you believe this is an error.";
        
        return $baseMessage . $resolutionMessage . $contactMessage;
    }

    /**
     * GET /api/staff/today-time-blocks
     * Returns today's appointment time blocks (appointments only, no walk-ins)
     */
    public function getTodayTimeBlocks(Request $request, ClinicDateResolverService $resolver)
    {
        $today = now()->startOfDay();
        $todayStr = $today->toDateString();
        
        // Get clinic hours for today
        $snap = $resolver->resolve($today);
        
        if (!$snap['is_open']) {
            return response()->json([
                'is_open' => false,
                'blocks' => [],
            ]);
        }
        
        // Build 30-min time blocks
        $blocks = ClinicDateResolverService::buildBlocks($snap['open_time'], $snap['close_time']);
        
        // Get approved appointments for today
        $appointments = Appointment::where('date', $todayStr)
            ->whereIn('status', ['approved', 'completed'])
            ->with(['patient.user', 'service'])
            ->get();
        
        // Map appointments to blocks
        $blockData = [];
        foreach ($blocks as $block) {
            $blockAppointments = [];
            
            foreach ($appointments as $apt) {
                if (!$apt->time_slot || strpos($apt->time_slot, '-') === false) continue;
                
                [$startStr] = explode('-', $apt->time_slot, 2);
                $startStr = trim($startStr);
                if (strlen($startStr) === 8) {
                    $startStr = \Carbon\Carbon::createFromFormat('H:i:s', $startStr)->format('H:i');
                }
                
                // Check if appointment starts in this block
                if ($startStr === $block) {
                    $blockAppointments[] = [
                        'id' => $apt->id,
                        'patient_name' => $apt->patient->first_name . ' ' . $apt->patient->last_name,
                        'service_name' => $apt->service->name,
                        'time_slot' => $apt->time_slot,
                        'status' => $apt->status,
                        'reference_code' => $apt->reference_code,
                    ];
                }
            }
            
            $blockData[] = [
                'time' => $block,
                'appointments' => $blockAppointments,
                'count' => count($blockAppointments),
            ];
        }
        
        return response()->json([
            'is_open' => true,
            'open_time' => $snap['open_time'],
            'close_time' => $snap['close_time'],
            'capacity' => $snap['effective_capacity'],
            'blocks' => $blockData,
        ]);
    }

    /**
     * Debug authentication and blocking status
     */
    public function debugAuth(Request $request): \Illuminate\Http\JsonResponse
    {
        try {
            $user = Auth::user();
            $userId = Auth::id();
            
            $debug = [
                'authenticated' => Auth::check(),
                'user_id' => $userId,
                'user' => $user ? [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'status' => $user->status,
                ] : null,
                'patient' => null,
                'block_info' => null,
                'ip' => IpHelper::getRealIpAddress($request),
                'user_agent' => $request->userAgent(),
                'headers' => $request->headers->all(),
            ];

            if ($user) {
                $patient = Patient::byUser($user->id);
                $debug['patient'] = $patient ? [
                    'id' => $patient->id,
                    'first_name' => $patient->first_name,
                    'last_name' => $patient->last_name,
                    'is_linked' => $patient->is_linked,
                ] : null;

                if ($patient) {
                    $userIp = IpHelper::getRealIpAddress($request);
                    $blockInfo = PatientManagerService::getPatientBlockInfo($patient->id, $userIp);
                    $debug['block_info'] = $blockInfo;
                }
            }

            return response()->json($debug);

        } catch (\Exception $e) {
            return response()->json([
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ], 500);
        }
    }

    /**
     * Check if the current patient is blocked from booking appointments
     */
    public function checkBlockedStatus(Request $request): \Illuminate\Http\JsonResponse
    {
        try {
            $patient = Patient::byUser(Auth::id());
            
            if (!$patient) {
                return response()->json([
                    'blocked' => false,
                    'message' => null,
                ]);
            }

            $userIp = IpHelper::getRealIpAddress($request);
            $blockInfo = PatientManagerService::getPatientBlockInfo($patient->id, $userIp);
            
            if ($blockInfo['blocked']) {
                $message = self::getBlockedPatientMessage($blockInfo);
                return response()->json([
                    'blocked' => true,
                    'block_type' => $blockInfo['block_type'],
                    'block_reason' => $blockInfo['block_reason'],
                    'message' => $message,
                ]);
            }

            return response()->json([
                'blocked' => false,
                'message' => null,
            ]);

        } catch (\Exception $e) {
            Log::error('Error checking blocked status', [
                'user_id' => Auth::id(),
                'error' => $e->getMessage(),
            ]);

            return response()->json([
                'blocked' => false,
                'message' => null,
            ]);
        }
    }

    /**
     * Staff endpoint to create appointments for walk-in patients
     */
    public function storeForStaff(Request $request, ClinicDateResolverService $resolver)
    {
        $validated = $request->validate([
            // Patient options - either link to existing or create new
            'patient_id'      => ['nullable', 'exists:patients,id'],
            'first_name'      => ['nullable', 'string', 'max:255'],
            'last_name'       => ['nullable', 'string', 'max:255'],
            'contact_number'  => ['nullable', 'string', 'max:20'],
            'email'           => ['nullable', 'email', 'max:255'],
            'birthdate'       => ['nullable', 'date_format:Y-m-d'],
            
            // Appointment details
            'service_id'      => ['required', 'exists:services,id'],
            'date'            => ['required', 'date_format:Y-m-d', 'after_or_equal:today'],
            'start_time'      => ['required', 'regex:/^\d{2}:\d{2}(:\d{2})?$/'],
            'payment_method'  => ['required', Rule::in(['cash', 'maya', 'hmo'])],
            'patient_hmo_id'  => ['nullable', 'integer', 'exists:patient_hmos,id'],
            'teeth_count'     => ['nullable', 'integer', 'min:1', 'max:32'],
            'honor_preferred_dentist' => ['sometimes', 'boolean'],
        ]);

        // Determine if we're linking to existing patient or creating new one
        $patient = null;
        if ($validated['patient_id']) {
            // Link to existing patient
            $patient = Patient::findOrFail($validated['patient_id']);
        } else {
            // Create new patient - validate required fields
            $request->validate([
                'first_name' => ['required', 'string', 'max:255'],
                'last_name' => ['required', 'string', 'max:255'],
                'contact_number' => ['required', 'string', 'max:20'],
            ]);
            
            $patient = Patient::create([
                'first_name' => $validated['first_name'],
                'last_name' => $validated['last_name'],
                'contact_number' => $validated['contact_number'],
                'email' => $validated['email'],
                'birthdate' => $validated['birthdate'],
                'user_id' => null, // No user account linked
            ]);
        }
        $service = Service::findOrFail($validated['service_id']);
        
        // Calculate estimated minutes based on teeth count for per-teeth services
        $estimatedMinutes = $service->calculateEstimatedMinutes($validated['teeth_count'] ?? null);
        $blocksNeeded = (int) max(1, ceil($estimatedMinutes / 30));
        $dateStr = $validated['date'];
        $date = Carbon::createFromFormat('Y-m-d', $dateStr)->startOfDay();

        $startRaw = $validated['start_time'];
        $startTime = Carbon::createFromFormat('H:i', $this->normalizeTime($startRaw));

        // For staff, allow booking up to 7 days in advance
        $today = now()->startOfDay();
        if ($date->lt($today) || $date->gt($today->copy()->addDays(7))) {
            return response()->json(['message' => 'Date is outside the booking window (today to 7 days).'], 422);
        }

        // resolve day snapshot
        $snap = $resolver->resolve($date);
        if (!$snap['is_open']) {
            return response()->json(['message' => 'Clinic is closed on this date.'], 422);
        }

        $open = Carbon::parse($snap['open_time']);
        $close = Carbon::parse($snap['close_time']);

        // ensure start is in the 30-min grid and inside hours
        $grid = ClinicDateResolverService::buildBlocks($snap['open_time'], $snap['close_time']);
        if (!in_array($startTime->format('H:i'), $grid, true)) {
            return response()->json(['message' => 'Invalid start time (not on grid or outside hours).'], 422);
        }

        // Calculate end time using 30-minute blocks
        $endTime = $startTime->copy()->addMinutes($blocksNeeded * 30);
        if ($startTime->lt($open) || $endTime->gt($close)) {
            return response()->json(['message' => 'Selected time is outside clinic hours.'], 422);
        }

        $honorPreferredRequested = $request->has('honor_preferred_dentist')
            ? $request->boolean('honor_preferred_dentist')
            : true;

        /** @var PreferredDentistService $preferredDentistService */
        $preferredDentistService = app(PreferredDentistService::class);
        $preferredDentist = $preferredDentistService->resolveForPatient($patient->id, $date);
        $preferredDentistId = $preferredDentist?->id;

        $capCheck = $this->checkCapacity($service, $dateStr, $startTime->format('H:i'), [
            'preferred_dentist_id' => $preferredDentistId,
            'requested_honor_preferred' => $honorPreferredRequested,
        ]);

        if (!$capCheck['ok']) {
            $message = $capCheck['message'] ?? null;
            if (!$message) {
                $fullAt = $capCheck['full_at'] ?? $startTime->format('H:i');
                $message = "Time slot starting at {$fullAt} is already full.";
            }
            return response()->json(['message' => $message], 422);
        }

        $assignedDentistId = $capCheck['assigned_dentist_id'] ?? null;
        if (isset($capCheck['end_time'])) {
            $endTime = $capCheck['end_time'];
        }

        // Check for overlapping appointments for the same patient
        $timeSlot = $this->normalizeTime($startTime) . '-' . $this->normalizeTime($endTime);
        if (Appointment::hasOverlappingAppointment($patient->id, $dateStr, $timeSlot)) {
            return response()->json([
                'message' => 'Patient already has an appointment at this time. Please choose a different time slot.',
            ], 422);
        }

        // HMO consistency checks
        $patientHmoId = $request->input('patient_hmo_id');

        if ($validated['payment_method'] === 'hmo') {
            if (!$patientHmoId) {
                return response()->json(['message' => 'Please select an HMO for this appointment.'], 422);
            }
            // must belong to this patient
            $hmo = DB::table('patient_hmos')->where('id', $patientHmoId)->first();
            if (!$hmo || (int)$hmo->patient_id !== (int)$patient->id) {
                return response()->json(['message' => 'Selected HMO does not belong to this patient.'], 422);
            }
        } else {
            $patientHmoId = null;
        }

        // create appointment
        $timeSlot = $this->normalizeTime($startTime) . '-' . $this->normalizeTime($endTime);
        $referenceCode = strtoupper(Str::random(8));

        $appointment = Appointment::create([
            'patient_id'      => $patient->id,
            'service_id'      => $service->id,
            'patient_hmo_id'  => $patientHmoId,
            'date'            => $dateStr,
            'time_slot'       => $timeSlot,
            'reference_code'  => $referenceCode,
            'status'          => 'approved', // Staff-created appointments are auto-approved
            'payment_method'  => $validated['payment_method'],
            'payment_status'  => $validated['payment_method'] === 'maya' ? 'awaiting_payment' : 'unpaid',
            'teeth_count'     => $validated['teeth_count'] ?? null,
            'dentist_schedule_id' => $assignedDentistId,
            'honor_preferred_dentist' => $honorPreferredRequested,
        ]);

        // Load relationships for response
        $appointment->load(['patient', 'service']);

        // Log appointment creation by staff
        $staffName = Auth::user() ? Auth::user()->name : 'Staff';
        SystemLogService::logAppointment(
            'created',
            $appointment->id,
            "Staff " . $staffName . " created appointment for {$patient->first_name} {$patient->last_name} for {$service->name}",
            [
                'appointment_id' => $appointment->id,
                'reference_code' => $appointment->reference_code,
                'patient_id' => $patient->id,
                'patient_name' => $patient->first_name . ' ' . $patient->last_name,
                'service_id' => $service->id,
                'service_name' => $service->name,
                'date' => $dateStr,
                'time_slot' => $timeSlot,
                'payment_method' => $validated['payment_method'],
                'created_by_staff' => true,
                'staff_name' => $staffName,
                'dentist_schedule_id' => $assignedDentistId,
                'honor_preferred_dentist' => $honorPreferredRequested,
            ]
        );

        return response()->json([
            'message' => 'Appointment created successfully.',
            'appointment' => $appointment,
        ], 201);
    }
}
