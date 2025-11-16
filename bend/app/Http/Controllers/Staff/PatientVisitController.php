<?php

namespace App\Http\Controllers\Staff;

use App\Models\Patient;
use App\Models\Payment;
use App\Models\SystemLog;
use App\Models\Appointment;
use App\Models\VisitNote;
use Illuminate\Support\Str;
use App\Models\PatientVisit;
use Illuminate\Http\Request;
use App\Models\InventoryItem;
use Illuminate\Support\Carbon;
use App\Models\InventoryMovement;
use Illuminate\Support\Facades\DB;
use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Log;
use App\Models\DentistSchedule;
use App\Models\Notification;
use App\Models\NotificationTarget;
use App\Models\PatientMedicalHistory;
use Illuminate\Support\Facades\Auth;


class PatientVisitController extends Controller
{
    // 🟢 List visits (e.g. for tracker)
    public function index()
    {
        // First, let's check if there are any visits with null start_time
        $nullStartTimeVisits = PatientVisit::whereNull('start_time')->count();
        Log::info('🔍 INDEX: Found ' . $nullStartTimeVisits . ' visits with null start_time');
        
        // Check total visits count
        $totalVisits = PatientVisit::count();
        Log::info('🔍 INDEX: Total visits in database: ' . $totalVisits);
        
        $visits = PatientVisit::with([
                'patient',
                'service',
                'visitNotes',
                'payments',
                'additionalCharges.inventoryItem',
                'assignedDentist',
            ])
            ->orderBy('created_at', 'desc')
            ->take(50)
            ->get();
        
        Log::info('🔍 INDEX: Returning ' . $visits->count() . ' visits from index method');
        Log::info('🔍 INDEX: Latest created_at in results: ' . ($visits->first()?->created_at ?? 'null'));
        
        foreach ($visits as $visit) {
            Log::info('📋 INDEX: Visit ID: ' . $visit->id . ', Status: ' . $visit->status . ', Patient: ' . $visit->patient?->first_name . ' ' . $visit->patient?->last_name . ', Start Time: ' . $visit->start_time . ', Patient ID: ' . $visit->patient_id);
        }

        return response()->json($visits);
    }

    // 🟢 Create a new patient visit (start timer)
    public function store(Request $request)
    {
        $visitType = $request->input('visit_type');
        Log::info('🚀 STORE: Creating visit with type: ' . $visitType);

        if ($visitType === 'walkin') {
            return DB::transaction(function () {
                // ✅ Create placeholder patient
                $patient = Patient::create([
                    'first_name' => 'Patient',
                    'last_name' => strtoupper(Str::random(6)),
                    'user_id' => null,
                ]);
                Log::info('👤 STORE: Created patient with ID: ' . $patient->id . ', Name: ' . $patient->first_name . ' ' . $patient->last_name);

                // ✅ Create the visit
                $startTime = now();
                $visit = PatientVisit::create([
                    'patient_id' => $patient->id,
                    'service_id' => null, // to be selected later
                    'visit_date' => now()->toDateString(),
                    'start_time' => $startTime,
                    'status' => 'pending',
                    'visit_code' => PatientVisit::generateVisitCode(),
                ]);
                Log::info('✅ STORE: Created visit with ID: ' . $visit->id . ', status: ' . $visit->status . ', patient_id: ' . $visit->patient_id . ', visit_code: ' . $visit->visit_code . ', start_time: ' . $visit->start_time . ', created_at: ' . $visit->created_at);

                // Load the visit with relationships before returning
                $visit->load(['patient', 'service', 'visitNotes']);
                
                return response()->json($visit, 201);
            });
        } elseif ($visitType === 'appointment') {
            $data = $request->validate([
                'reference_code' => ['required', 'string', 'size:8'],
            ]);

            $code = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $data['reference_code']));

            $appointment = Appointment::with(['patient', 'service'])
                ->whereRaw('UPPER(reference_code) = ?', [$code])
                ->where('status', 'approved')
                // ->whereDate('date', now()->toDateString()) // re-enable if you want “today only”
                ->first();

            if (!$appointment) {
                return response()->json(['message' => 'Invalid or unavailable reference code.'], 422);
            }

            // Check if visit already exists for this appointment
            $existingVisit = PatientVisit::where('appointment_id', $appointment->id)
                ->where('status', 'pending')
                ->first();

            if ($existingVisit) {
                return response()->json([
                    'visit' => $existingVisit->load(['patient', 'service']),
                    'requires_medical_history' => $existingVisit->medical_history_status === 'pending',
                    'message' => 'Visit already exists for this appointment.',
                ]);
            }

            // Create the visit WITHOUT visit_code - it will be generated after history is completed
            $visit = PatientVisit::create([
                'patient_id' => $appointment->patient_id,
                'appointment_id' => $appointment->id,
                'service_id' => $appointment->service_id,
                'visit_date' => now()->toDateString(),
                'start_time' => now(),
                'status' => 'pending',
                'visit_code' => null, // Will be generated after history completion
                'medical_history_status' => 'pending',
            ]);

            return response()->json([
                'visit' => $visit->load(['patient', 'service']),
                'requires_medical_history' => true,
                'message' => 'Medical history required before visit can proceed.',
            ], 201);
        }

        return response()->json(['message' => 'Invalid visit type.'], 422);
    }

    // 🟡 Update visit details (e.g. service selection)
    public function updatePatient(Request $request, $id)
    {
        $visit = PatientVisit::findOrFail($id);
        $patient = $visit->patient;

        $validated = $request->validate([
            'first_name' => 'required|string|max:100',
            'last_name' => 'required|string|max:100',
            'contact_number' => 'nullable|string|max:20',
            'service_id' => 'nullable|exists:services,id',
        ]);

        // Only check for potential matching patients if the name actually changed
        $nameChanged = 
            strtolower(trim($validated['first_name'])) !== strtolower(trim($patient->first_name)) ||
            strtolower(trim($validated['last_name'])) !== strtolower(trim($patient->last_name));

        $potentialMatches = collect(); // Default to empty collection

        if ($nameChanged) {
            // Check for potential matching patients before updating
            $potentialMatches = Patient::findPotentialMatches(
                $validated['first_name'],
                $validated['last_name'],
                $patient->id
            );
        }

        $patient->update([
            'first_name' => $validated['first_name'],
            'last_name' => $validated['last_name'],
            'contact_number' => $validated['contact_number'],
        ]);

        $visit->update([
            'service_id' => $validated['service_id'],
        ]);

        // If there are matching patients, return them so staff can link
        if ($potentialMatches->isNotEmpty()) {
            return response()->json([
                'message' => 'Patient updated',
                'potential_matches' => $potentialMatches->map(function ($match) {
                    return [
                        'id' => $match->id,
                        'first_name' => $match->first_name,
                        'last_name' => $match->last_name,
                        'contact_number' => $match->contact_number,
                        'birthdate' => $match->birthdate,
                        'has_user_account' => $match->user_id !== null,
                        'user_email' => $match->user?->email,
                        'is_linked' => $match->is_linked,
                    ];
                })
            ]);
        }

        return response()->json(['message' => 'Patient updated']);
    }

    /**
     * GET /api/visits/{id}/medical-history-form
     * Get form data for medical history (pre-filled from previous records and patient data)
     */
    public function getMedicalHistoryForm($id)
    {
        $visit = PatientVisit::with('patient', 'appointment')->findOrFail($id);
        
        // Check if already completed
        if ($visit->medical_history_status === 'completed') {
            $medicalHistory = PatientMedicalHistory::where('patient_visit_id', $visit->id)->first();
            return response()->json([
                'medical_history' => $medicalHistory,
                'visit' => $visit,
                'is_completed' => true,
                'message' => 'Medical history already completed for this visit.',
            ]);
        }
        
        $patient = $visit->patient;
        
        // Get the MOST RECENT medical history for this patient (from previous visits)
        $previousHistory = PatientMedicalHistory::where('patient_id', $patient->id)
            ->where('patient_visit_id', '!=', $visit->id) // Exclude current visit
            ->orderBy('completed_at', 'desc')
            ->first();
        
        // Pre-fill data structure
        $prefilledData = [];
        
        // 1. Pre-fill from patient record (current data)
        if ($patient) {
            $prefilledData = [
                'full_name' => $patient->first_name . ' ' . $patient->last_name,
                'sex' => $patient->sex,
                'address' => $patient->address,
                'contact_number' => $patient->contact_number,
                'date_of_birth' => $patient->birthdate?->format('Y-m-d'),
                'age' => $patient->birthdate ? now()->diffInYears($patient->birthdate) : null,
            ];
        }
        
        // 2. Pre-fill from previous medical history (if exists)
        if ($previousHistory) {
            $prefilledData = array_merge($prefilledData, [
                // Patient Information
                'occupation' => $previousHistory->occupation,
                'email' => $previousHistory->email,
                'previous_dentist' => $previousHistory->previous_dentist,
                'last_dental_visit' => $previousHistory->last_dental_visit?->format('Y-m-d'),
                'physician_name' => $previousHistory->physician_name,
                'physician_address' => $previousHistory->physician_address,
                
                // Health Questions
                'in_good_health' => $previousHistory->in_good_health,
                'under_medical_treatment' => $previousHistory->under_medical_treatment,
                'medical_treatment_details' => $previousHistory->medical_treatment_details,
                'serious_illness_surgery' => $previousHistory->serious_illness_surgery,
                'illness_surgery_details' => $previousHistory->illness_surgery_details,
                'hospitalized' => $previousHistory->hospitalized,
                'hospitalization_details' => $previousHistory->hospitalization_details,
                'taking_medications' => $previousHistory->taking_medications,
                'medications_list' => $previousHistory->medications_list,
                'uses_tobacco' => $previousHistory->uses_tobacco,
                'uses_alcohol_drugs' => $previousHistory->uses_alcohol_drugs,
                
                // Allergies
                'allergic_local_anesthetic' => $previousHistory->allergic_local_anesthetic,
                'allergic_penicillin' => $previousHistory->allergic_penicillin,
                'allergic_sulfa' => $previousHistory->allergic_sulfa,
                'allergic_aspirin' => $previousHistory->allergic_aspirin,
                'allergic_latex' => $previousHistory->allergic_latex,
                'allergic_others' => $previousHistory->allergic_others,
                
                // For Women Only
                'is_pregnant' => $previousHistory->is_pregnant,
                'is_nursing' => $previousHistory->is_nursing,
                'taking_birth_control' => $previousHistory->taking_birth_control,
                
                // Vital Information
                'blood_type' => $previousHistory->blood_type,
                'blood_pressure' => $previousHistory->blood_pressure,
                'bleeding_time' => $previousHistory->bleeding_time,
                
                // Medical Conditions
                'high_blood_pressure' => $previousHistory->high_blood_pressure,
                'low_blood_pressure' => $previousHistory->low_blood_pressure,
                'heart_disease' => $previousHistory->heart_disease,
                'heart_murmur' => $previousHistory->heart_murmur,
                'chest_pain' => $previousHistory->chest_pain,
                'stroke' => $previousHistory->stroke,
                'diabetes' => $previousHistory->diabetes,
                'hepatitis' => $previousHistory->hepatitis,
                'tuberculosis' => $previousHistory->tuberculosis,
                'kidney_disease' => $previousHistory->kidney_disease,
                'cancer' => $previousHistory->cancer,
                'asthma' => $previousHistory->asthma,
                'anemia' => $previousHistory->anemia,
                'arthritis' => $previousHistory->arthritis,
                'epilepsy' => $previousHistory->epilepsy,
                'aids_hiv' => $previousHistory->aids_hiv,
                'stomach_troubles' => $previousHistory->stomach_troubles,
                'thyroid_problems' => $previousHistory->thyroid_problems,
                'hay_fever' => $previousHistory->hay_fever,
                'head_injuries' => $previousHistory->head_injuries,
                'rapid_weight_loss' => $previousHistory->rapid_weight_loss,
                'joint_replacement' => $previousHistory->joint_replacement,
                'radiation_therapy' => $previousHistory->radiation_therapy,
                'swollen_ankles' => $previousHistory->swollen_ankles,
                'other_conditions' => $previousHistory->other_conditions,
            ]);
        }
        
        return response()->json([
            'form_data' => $prefilledData,
            'visit' => $visit,
            'patient' => $patient,
            'previous_history_exists' => $previousHistory !== null,
            'previous_history_date' => $previousHistory?->completed_at?->format('Y-m-d'),
            'requires_medical_history' => $visit->medical_history_status === 'pending',
            'message' => $previousHistory 
                ? 'Form pre-filled with previous medical history. Please review and update if necessary.' 
                : 'No previous medical history found. Please complete the form.',
        ]);
    }

    /**
     * POST /api/visits/{id}/medical-history
     * Complete medical history for visit (saves new record, even if pre-filled)
     */
    public function submitMedicalHistory(Request $request, $id)
    {
        $visit = PatientVisit::with('patient')->findOrFail($id);
        
        // Check if already completed
        if ($visit->medical_history_status === 'completed') {
            return response()->json([
                'message' => 'Medical history already completed for this visit.',
                'visit' => $visit,
            ], 422);
        }

        $validated = $request->validate([
            // Patient Information
            'full_name' => 'nullable|string|max:255',
            'age' => 'nullable|integer|min:0|max:150',
            'sex' => 'nullable|in:male,female',
            'address' => 'nullable|string|max:500',
            'contact_number' => 'nullable|string|max:20',
            'occupation' => 'nullable|string|max:255',
            'date_of_birth' => 'nullable|date',
            'email' => 'nullable|email|max:255',
            'previous_dentist' => 'nullable|string|max:255',
            'last_dental_visit' => 'nullable|date',
            'physician_name' => 'nullable|string|max:255',
            'physician_address' => 'nullable|string|max:500',
            
            // Health Questions
            'in_good_health' => 'nullable|boolean',
            'under_medical_treatment' => 'nullable|boolean',
            'medical_treatment_details' => 'nullable|string',
            'serious_illness_surgery' => 'nullable|boolean',
            'illness_surgery_details' => 'nullable|string',
            'hospitalized' => 'nullable|boolean',
            'hospitalization_details' => 'nullable|string',
            'taking_medications' => 'nullable|boolean',
            'medications_list' => 'nullable|string',
            'uses_tobacco' => 'nullable|boolean',
            'uses_alcohol_drugs' => 'nullable|boolean',
            
            // Allergies
            'allergic_local_anesthetic' => 'nullable|boolean',
            'allergic_penicillin' => 'nullable|boolean',
            'allergic_sulfa' => 'nullable|boolean',
            'allergic_aspirin' => 'nullable|boolean',
            'allergic_latex' => 'nullable|boolean',
            'allergic_others' => 'nullable|string',
            
            // For Women Only
            'is_pregnant' => 'nullable|boolean',
            'is_nursing' => 'nullable|boolean',
            'taking_birth_control' => 'nullable|boolean',
            
            // Vital Information
            'blood_type' => 'nullable|string|max:10',
            'blood_pressure' => 'nullable|string|max:50',
            'bleeding_time' => 'nullable|string|max:50',
            
            // Medical Conditions (all boolean)
            'high_blood_pressure' => 'nullable|boolean',
            'low_blood_pressure' => 'nullable|boolean',
            'heart_disease' => 'nullable|boolean',
            'heart_murmur' => 'nullable|boolean',
            'chest_pain' => 'nullable|boolean',
            'stroke' => 'nullable|boolean',
            'diabetes' => 'nullable|boolean',
            'hepatitis' => 'nullable|boolean',
            'tuberculosis' => 'nullable|boolean',
            'kidney_disease' => 'nullable|boolean',
            'cancer' => 'nullable|boolean',
            'asthma' => 'nullable|boolean',
            'anemia' => 'nullable|boolean',
            'arthritis' => 'nullable|boolean',
            'epilepsy' => 'nullable|boolean',
            'aids_hiv' => 'nullable|boolean',
            'stomach_troubles' => 'nullable|boolean',
            'thyroid_problems' => 'nullable|boolean',
            'hay_fever' => 'nullable|boolean',
            'head_injuries' => 'nullable|boolean',
            'rapid_weight_loss' => 'nullable|boolean',
            'joint_replacement' => 'nullable|boolean',
            'radiation_therapy' => 'nullable|boolean',
            'swollen_ankles' => 'nullable|boolean',
            'other_conditions' => 'nullable|string',
        ]);

        return DB::transaction(function () use ($visit, $validated) {
            // Auto-fill some fields from patient if not provided
            if ($visit->patient) {
                $validated['full_name'] = $validated['full_name'] ?? 
                    ($visit->patient->first_name . ' ' . $visit->patient->last_name);
                $validated['sex'] = $validated['sex'] ?? $visit->patient->sex;
                $validated['address'] = $validated['address'] ?? $visit->patient->address;
                $validated['contact_number'] = $validated['contact_number'] ?? $visit->patient->contact_number;
                $validated['date_of_birth'] = $validated['date_of_birth'] ?? $visit->patient->birthdate?->toDateString();
                
                // Calculate age if date_of_birth is available
                if (isset($validated['date_of_birth']) && !isset($validated['age'])) {
                    $validated['age'] = now()->diffInYears(\Carbon\Carbon::parse($validated['date_of_birth']));
                }
            }

            // Create medical history (NEW record for this visit, even if data is same)
            $medicalHistory = PatientMedicalHistory::create(array_merge($validated, [
                'patient_id' => $visit->patient_id,
                'patient_visit_id' => $visit->id,
                'completed_by' => Auth::id(),
                'completed_at' => now(),
            ]));

            // Update visit status and generate visit code
            $visit->update([
                'medical_history_status' => 'completed',
                'medical_history_id' => $medicalHistory->id,
                'visit_code' => PatientVisit::generateVisitCode(), // Generate code after history completion
            ]);

            // Prevent code reuse on appointment
            if ($visit->appointment) {
                $visit->appointment->reference_code = null;
                $visit->appointment->save();
            }

            return response()->json([
                'message' => 'Medical history completed. Visit code generated.',
                'visit' => $visit->load('patient', 'service', 'appointment'),
                'medical_history' => $medicalHistory,
            ]);
        });
    }

    /**
     * GET /api/visits/{id}/medical-history
     * Get completed medical history for a visit
     */
    public function getMedicalHistory($id)
    {
        $visit = PatientVisit::findOrFail($id);
        
        $medicalHistory = PatientMedicalHistory::where('patient_visit_id', $visit->id)->first();
        
        return response()->json([
            'medical_history' => $medicalHistory,
            'visit' => $visit,
            'requires_medical_history' => $visit->medical_history_status === 'pending',
        ]);
    }

    // 🟡 Mark a visit as finished (end timer)
    public function finish($id)
    {
        $visit = PatientVisit::findOrFail($id);

        if ($visit->status !== 'pending') {
            return response()->json(['message' => 'Only pending visits can be processed.'], 422);
        }

        if (!$visit->dentist_schedule_id || !$visit->visit_code_sent_at) {
            return response()->json(['message' => 'Send the visit code to a dentist before completing the visit.'], 422);
        }

        $visit->update([
            'end_time' => now(),
            'status' => 'completed',
            'visit_code' => null, // Clear the code to make it unusable
        ]);

        return response()->json(['message' => 'Visit completed.']);
    }

    /**
     * POST /api/visits/{id}/complete-with-details
     * Complete visit with stock consumption, encrypted notes, and payment verification
     */
    public function completeWithDetails(Request $request, $id)
    {
        $visit = PatientVisit::with(['patient', 'service', 'payments', 'visitNotes'])->findOrFail($id);

        if ($visit->status !== 'pending') {
            return response()->json(['message' => 'Only pending visits can be completed.'], 422);
        }

        if (!$visit->dentist_schedule_id || !$visit->visit_code_sent_at) {
            return response()->json(['message' => 'Send the visit code to a dentist before completing the visit.'], 422);
        }

        $validated = $request->validate([
            'stock_items' => ['nullable', 'array'],
            'stock_items.*.item_id' => ['required', 'exists:inventory_items,id'],
            'stock_items.*.quantity' => ['required', 'numeric', 'min:0.001'],
            'stock_items.*.notes' => ['nullable', 'string'],
            'billable_items' => ['nullable', 'array'],
            'billable_items.*.item_id' => ['required', 'exists:inventory_items,id'],
            'billable_items.*.quantity' => ['required', 'numeric', 'min:1'],
            'billable_items.*.unit_price' => ['required', 'numeric', 'min:0'],
            'dentist_notes' => ['nullable', 'string', 'max:2000'],
            'findings' => ['nullable', 'string', 'max:2000'],
            'treatment_plan' => ['nullable', 'string', 'max:2000'],
            'teeth_treated' => ['nullable', 'string', 'max:200'],
            'payment_status' => ['required', 'in:paid,hmo_fully_covered,partial,unpaid'],
            'onsite_payment_amount' => ['nullable', 'numeric', 'min:0'],
            'payment_method_change' => ['nullable', 'in:maya_to_cash'],
        ]);

        // Validate teeth format if provided
        if (!empty($validated['teeth_treated'])) {
            $teethErrors = \App\Models\Service::validateTeethFormat($validated['teeth_treated']);
            if (!empty($teethErrors)) {
                return response()->json([
                    'message' => 'Invalid teeth format',
                    'errors' => ['teeth_treated' => $teethErrors]
                ], 422);
            }
        }

        $userId = $request->user()->id;
        $stockItems = $validated['stock_items'] ?? [];
        $billableItems = $validated['billable_items'] ?? [];

        if (!is_array($stockItems)) {
            $stockItems = [];
        }

        if (!is_array($billableItems)) {
            $billableItems = [];
        }

        return DB::transaction(function () use ($visit, $validated, $userId, $stockItems, $billableItems) {
            // 1. Consume stock items and update batch quantities
            foreach ($stockItems as $item) {
                $inventoryItem = InventoryItem::with([
                    'batches' => function ($q) {
                        $q->where('qty_on_hand', '>', 0)
                            ->orderByRaw('CASE WHEN expiry_date IS NULL THEN 1 ELSE 0 END')
                            ->orderBy('expiry_date', 'asc')
                            ->orderBy('received_at', 'asc')
                            ->lockForUpdate();
                    }
                ])->findOrFail($item['item_id']);

                $totalOnHand = (float) $inventoryItem->batches->sum('qty_on_hand');
                if ((float) $item['quantity'] > $totalOnHand) {
                    throw new \Exception("Insufficient stock for {$inventoryItem->name}. Requested {$item['quantity']} but only {$totalOnHand} available.");
                }

                $remaining = (float) $item['quantity'];
                foreach ($inventoryItem->batches as $batch) {
                    if ($remaining <= 0)
                        break;

                    $take = min($remaining, (float) $batch->qty_on_hand);
                    $batch->qty_on_hand = (float) $batch->qty_on_hand - $take;
                    $batch->save();

                    InventoryMovement::create([
                        'item_id' => $item['item_id'],
                        'batch_id' => $batch->id,
                        'type' => 'consume',
                        'quantity' => $take,
                        'ref_type' => 'visit',
                        'ref_id' => $visit->id,
                        'user_id' => $userId,
                        'notes' => $item['notes'] ?? null,
                    ]);

                    $remaining -= $take;
                }

                // Check for low stock threshold after consumption
                $inventoryItem->refresh();
                if ($inventoryItem->low_stock_threshold > 0) {
                    $total = (float) $inventoryItem->batches()->sum('qty_on_hand');
                    if ($total <= (float) $inventoryItem->low_stock_threshold) {
                        \App\Services\NotificationService::notifyLowStock($inventoryItem, $total);
                    }
                }
            }

            // 2. Create or update encrypted visit notes
            if ($visit->visitNotes) {
                // Update existing notes
                $visit->visitNotes->update([
                    'dentist_notes_encrypted' => $validated['dentist_notes'] ?? $visit->visitNotes->dentist_notes_encrypted,
                    'findings_encrypted' => $validated['findings'] ?? $visit->visitNotes->findings_encrypted,
                    'treatment_plan_encrypted' => $validated['treatment_plan'] ?? $visit->visitNotes->treatment_plan_encrypted,
                    'teeth_treated' => $validated['teeth_treated'] ?? $visit->visitNotes->teeth_treated,
                    'updated_by' => $userId,
                ]);
            } else {
                // Create new notes
                $visit->visitNotes()->create([
                    'dentist_notes_encrypted' => $validated['dentist_notes'] ?? null,
                    'findings_encrypted' => $validated['findings'] ?? null,
                    'treatment_plan_encrypted' => $validated['treatment_plan'] ?? null,
                    'teeth_treated' => $validated['teeth_treated'] ?? null,
                    'created_by' => $userId,
                ]);
            }

            // 3. Handle billable items (additional charges)
            if (!empty($billableItems)) {
                foreach ($billableItems as $item) {
                    $inventoryItem = InventoryItem::findOrFail($item['item_id']);
                    
                    // Verify the item is sellable
                    if (!$inventoryItem->is_sellable || !$inventoryItem->patient_price) {
                        throw new \Exception("Item '{$inventoryItem->name}' is not configured as a sellable item.");
                    }
                    
                    // Get the first available batch for tracking
                    $batch = $inventoryItem->batches()
                        ->where('qty_on_hand', '>', 0)
                        ->orderBy('expiry_date', 'asc')
                        ->orderBy('received_at', 'asc')
                        ->first();
                    
                    \App\Models\VisitAdditionalCharge::create([
                        'patient_visit_id' => $visit->id,
                        'inventory_item_id' => $item['item_id'],
                        'quantity' => (float) $item['quantity'],
                        'unit_price' => (float) $item['unit_price'],
                        'total_price' => (float) $item['quantity'] * (float) $item['unit_price'],
                        'batch_id' => $batch?->id,
                        'created_by' => $userId,
                    ]);
                }
            }

            // 4. Update visit status
            $visit->update([
                'end_time' => now(),
                'status' => 'completed',
            ]);

            // 5. Handle payment verification/adjustment
            $totalPaid = $visit->payments->sum('amount_paid');
            // Use date-aware pricing for service price (handles promos/discounts)
            $visitDate = $visit->visit_date ? $visit->visit_date->toDateString() : now()->toDateString();
            $servicePrice = $visit->service ? (float) $visit->service->getPriceForDate($visitDate) : 0.0;
            
            // Calculate additional charges total
            $additionalChargesTotal = 0;
            if (!empty($billableItems)) {
                foreach ($billableItems as $item) {
                    $additionalChargesTotal += ((float) $item['quantity'] * (float) $item['unit_price']);
                }
            }
            
            $totalPrice = $servicePrice + $additionalChargesTotal;

            if ($validated['payment_status'] === 'paid') {
                // If already fully paid, no action needed
                // If not fully paid, create a cash payment to cover the balance
                if ($totalPaid < $totalPrice) {
                    $balance = $totalPrice - $totalPaid;
                    Payment::create([
                        'patient_visit_id' => $visit->id,
                        'amount_due' => $balance,
                        'amount_paid' => $balance,
                        'method' => 'cash',
                        'status' => 'paid',
                        'reference_no' => 'CASH-' . $visit->id . '-' . time(),
                        'created_by' => $userId,
                        'paid_at' => now(),
                    ]);
                }
            } elseif ($validated['payment_status'] === 'hmo_fully_covered') {
                // HMO fully covered - only covers service price, not additional charges
                // If there are additional charges, visit will be marked as partial/unpaid
                if ($additionalChargesTotal > 0) {
                    // Service is covered, but additional charges need to be paid
                    Payment::create([
                        'patient_visit_id' => $visit->id,
                        'amount_due' => $servicePrice,
                        'amount_paid' => $servicePrice,
                        'method' => 'hmo',
                        'status' => 'paid',
                        'reference_no' => 'HMO-' . $visit->id . '-' . time(),
                        'created_by' => $userId,
                        'paid_at' => now(),
                    ]);
                    // Mark visit payment status as unpaid since there are additional charges
                    // The user will need to handle this on the frontend
                } else {
                    // No additional charges, fully covered
                    Payment::create([
                        'patient_visit_id' => $visit->id,
                        'amount_due' => $servicePrice,
                        'amount_paid' => $servicePrice,
                        'method' => 'hmo',
                        'status' => 'paid',
                        'reference_no' => 'HMO-' . $visit->id . '-' . time(),
                        'created_by' => $userId,
                        'paid_at' => now(),
                    ]);
                }
            } elseif ($validated['payment_status'] === 'partial' && isset($validated['onsite_payment_amount'])) {
                // Add on-site payment
                Payment::create([
                    'patient_visit_id' => $visit->id,
                    'amount_due' => $validated['onsite_payment_amount'],
                    'amount_paid' => $validated['onsite_payment_amount'],
                    'method' => 'cash',
                    'status' => 'paid',
                    'reference_no' => 'CASH-' . $visit->id . '-' . time(),
                    'created_by' => $userId,
                    'paid_at' => now(),
                ]);
            } elseif ($validated['payment_status'] === 'unpaid' && isset($validated['payment_method_change'])) {
                // Change Maya to cash payment
                $mayaPayment = $visit->payments->where('method', 'maya')->first();
                if ($mayaPayment) {
                    $mayaPayment->update([
                        'method' => 'cash',
                        'status' => 'paid',
                        'amount_paid' => $mayaPayment->amount_due,
                        'paid_at' => now(),
                    ]);
                }
            }

            // 4) Update appointment.payment_status based on the processed visit payment_status
            // Map visit payment status -> appointment's simple enum
            $appointmentPaymentStatus = match ($validated['payment_status']) {
                'paid', 'hmo_fully_covered', 'partial' => 'paid', // any payment -> paid
                'unpaid' => 'unpaid',
                default => 'unpaid',
            };

            // Find and update matching appointments
            $matchingAppointments = Appointment::where('patient_id', $visit->patient_id)
                ->where('service_id', $visit->service_id)
                ->where('date', $visit->visit_date)
                ->whereIn('status', ['approved', 'completed'])
                ->get();

            Log::info('Updating appointment payment status', [
                'visit_id' => $visit->id,
                'patient_id' => $visit->patient_id,
                'service_id' => $visit->service_id,
                'visit_date' => $visit->visit_date,
                'payment_status' => $validated['payment_status'],
                'appointment_payment_status' => $appointmentPaymentStatus,
                'matching_appointments_count' => $matchingAppointments->count()
            ]);

            foreach ($matchingAppointments as $appointment) {
                $oldStatus = $appointment->payment_status;
                $appointment->update(['payment_status' => $appointmentPaymentStatus]);
                
                Log::info('Appointment payment status updated', [
                    'appointment_id' => $appointment->id,
                    'old_status' => $oldStatus,
                    'new_status' => $appointmentPaymentStatus
                ]);
            }


            return response()->json([
                'message' => 'Visit completed successfully',
                'visit' => $visit->fresh(['patient', 'service', 'payments', 'additionalCharges']),
            ]);
        });
    }

    // 🔴 Reject visit
    public function reject($id, Request $request)
    {
        $visit = PatientVisit::findOrFail($id);

        if ($visit->status !== 'pending') {
            return response()->json(['message' => 'Only pending visits can be processed.'], 422);
        }

        $reason = $request->input('reason');
        $status = $reason === 'inquiry_only' ? 'inquiry' : 'rejected';

        $visit->update([
            'end_time' => now(),
            'status' => $status,
            'note' => $this->buildRejectionNote($request),
            'visit_code' => null, // Clear the code to make it unusable
        ]);

        $message = $status === 'inquiry' ? 'Visit marked as inquiry only.' : 'Visit rejected.';
        return response()->json(['message' => $message]);
    }

    private function buildRejectionNote(Request $request)
    {
        $reason = $request->input('reason'); // 'human_error', 'left', 'line_too_long', 'inquiry_only'
        $offered = $request->input('offered_appointment'); // true or false

        if ($reason === 'line_too_long') {
            return "Rejected: Line too long. Offered appointment: " . ($offered ? 'Yes' : 'No');
        }

        return match ($reason) {
            'human_error' => 'Rejected: Human error',
            'left' => 'Rejected: Patient left',
            'inquiry_only' => 'Inquiry only: Patient inquired about services but did not proceed with treatment',
            default => 'Rejected: Unknown reason'
        };
    }

    /**
     * GET /api/visits/{id}/potential-matches
     * Get potential matching patients for a visit based on patient name
     */
    public function getPotentialMatches($visitId)
    {
        $visit = PatientVisit::with('patient')->findOrFail($visitId);
        $patient = $visit->patient;

        if (!$patient) {
            return response()->json([
                'potential_matches' => []
            ]);
        }

        $potentialMatches = Patient::findPotentialMatches(
            $patient->first_name,
            $patient->last_name,
            $patient->id
        );

        return response()->json([
            'potential_matches' => $potentialMatches->map(function ($match) {
                return [
                    'id' => $match->id,
                    'first_name' => $match->first_name,
                    'last_name' => $match->last_name,
                    'contact_number' => $match->contact_number,
                    'birthdate' => $match->birthdate,
                    'has_user_account' => $match->user_id !== null,
                    'user_email' => $match->user?->email,
                    'is_linked' => $match->is_linked,
                ];
            })
        ]);
    }

    public function linkToExistingPatient(Request $request, $visitId)
    {
        $request->validate([
            'target_patient_id' => 'required|exists:patients,id',
            'service_id' => 'nullable|exists:services,id',
        ]);

        return DB::transaction(function () use ($request, $visitId) {
            $visit = PatientVisit::with('patient')->findOrFail($visitId);
            $oldPatientId = $visit->patient_id;
            $oldPatient = $visit->patient;
            $targetPatient = Patient::findOrFail($request->target_patient_id);

            // Only allow linking walk-in visits, not appointment-based visits
            if ($visit->appointment_id !== null) {
                Log::warning('🛑 LINK: Attempted to link appointment-based visit', [
                    'old_patient_id' => $oldPatientId,
                    'visit_id' => $visitId,
                    'appointment_id' => $visit->appointment_id
                ]);
                return response()->json([
                    'message' => 'Cannot link visit: This visit is from an appointment and is already associated with a patient.',
                ], 422);
            }

            // Check if the old patient has any other visits BEFORE we update
            $otherVisits = PatientVisit::where('patient_id', $oldPatientId)->count();
            
            // Prepare update data
            $updateData = [
                'patient_id' => $targetPatient->id,
            ];
            
            // Preserve service_id if provided
            if ($request->has('service_id') && $request->service_id) {
                $updateData['service_id'] = $request->service_id;
            }
            
            // Replace the link to the correct patient profile
            $visit->update($updateData);

            // Delete the temporary patient profile (only if it's a walk-in patient with no other visits)
            if ($otherVisits === 0) {
                // Safe to delete: this was the only visit for this temporary patient
                Log::info('🗑️ LINK: About to delete temporary patient ID: ' . $oldPatientId . ', Name: ' . $oldPatient->first_name . ' ' . $oldPatient->last_name);
                $oldPatient->delete();
                Log::info('🗑️ LINK: Deleted temporary patient ID: ' . $oldPatientId);
            } else {
                // Keep the patient: they have other visits
                Log::info('ℹ️ LINK: Keeping patient ID: ' . $oldPatientId . ' because they have ' . $otherVisits . ' other visits');
            }

            return response()->json([
                'message' => 'Visit successfully linked to existing patient profile.',
                'visit' => $visit->load('patient'),
            ]);
        });
    }

    /**
     * POST /api/visits/{id}/view-notes
     * View encrypted visit notes with current user's password verification
     */
    public function viewNotes(Request $request, $id)
    {
        $visit = PatientVisit::with(['patient', 'visitNotes'])->findOrFail($id);
        $user = $request->user();

        if (!$visit->visitNotes) {
            return response()->json(['message' => 'No notes found for this visit.'], 404);
        }

        $validated = $request->validate([
            'password' => 'required|string',
        ]);

        // Verify the current user's password
        if (!Hash::check($validated['password'], $user->password)) {
            // Log failed access attempt
            SystemLog::create([
                'user_id' => $user->id,
                'category' => 'visit_notes',
                'action' => 'access_denied',
                'subject_id' => $visit->id,
                'message' => 'Failed to access visit notes - invalid password',
                'context' => [
                    'visit_id' => $visit->id,
                    'patient_name' => $visit->patient ? $visit->patient->first_name . ' ' . $visit->patient->last_name : 'Unknown',
                    'attempted_at' => now()->toISOString(),
                ],
            ]);

            return response()->json(['message' => 'Invalid password.'], 401);
        }

        try {
            // Access the encrypted notes (Laravel will decrypt automatically)
            $notes = $visit->visitNotes;
            
            // Record access for audit trail
            $notes->recordAccess($user->id);

            // Log successful access
            SystemLog::create([
                'user_id' => $user->id,
                'category' => 'visit_notes',
                'action' => 'viewed',
                'subject_id' => $visit->id,
                'message' => 'Successfully accessed encrypted visit notes',
                'context' => [
                    'visit_id' => $visit->id,
                    'patient_name' => $visit->patient ? $visit->patient->first_name . ' ' . $visit->patient->last_name : 'Unknown',
                    'accessed_at' => now()->toISOString(),
                    'notes_contained' => [
                        'dentist_notes' => !empty($notes->dentist_notes),
                        'findings' => !empty($notes->findings),
                        'treatment_plan' => !empty($notes->treatment_plan),
                    ],
                ],
            ]);

            return response()->json([
                'message' => 'Notes decrypted successfully.',
                'notes' => [
                    'dentist_notes' => $notes->dentist_notes,
                    'findings' => $notes->findings,
                    'treatment_plan' => $notes->treatment_plan,
                    'completed_by' => $notes->created_by,
                    'completed_at' => $notes->created_at->toISOString(),
                    'last_accessed_at' => $notes->last_accessed_at?->toISOString(),
                    'last_accessed_by' => $notes->last_accessed_by,
                ],
            ]);
        } catch (\Exception $e) {
            // Log decryption failure
            SystemLog::create([
                'user_id' => $user->id,
                'category' => 'visit_notes',
                'action' => 'decryption_failed',
                'subject_id' => $visit->id,
                'message' => 'Failed to decrypt visit notes',
                'context' => [
                    'visit_id' => $visit->id,
                    'patient_name' => $visit->patient ? $visit->patient->first_name . ' ' . $visit->patient->last_name : 'Unknown',
                    'error' => $e->getMessage(),
                    'attempted_at' => now()->toISOString(),
                ],
            ]);

            return response()->json(['message' => 'Failed to decrypt notes.'], 500);
        }
    }

    /**
     * POST /api/visits/{id}/save-dentist-notes
     * Save dentist notes during visit (before completion)
     */
    public function saveDentistNotes(Request $request, $id)
    {
        $visit = PatientVisit::with(['visitNotes'])->findOrFail($id);
        
        if ($visit->status !== 'pending') {
            return response()->json(['message' => 'Only pending visits can have notes updated.'], 422);
        }

        $validated = $request->validate([
            'dentist_notes' => ['nullable', 'string', 'max:2000'],
            'findings' => ['nullable', 'string', 'max:2000'],
            'treatment_plan' => ['nullable', 'string', 'max:2000'],
            'teeth_treated' => ['nullable', 'string', 'max:200'],
        ]);

        // Validate teeth format if provided
        if (!empty($validated['teeth_treated'])) {
            $teethErrors = \App\Models\Service::validateTeethFormat($validated['teeth_treated']);
            if (!empty($teethErrors)) {
                return response()->json([
                    'message' => 'Invalid teeth format',
                    'errors' => ['teeth_treated' => $teethErrors]
                ], 422);
            }
        }

        $userId = $request->user()->id;
        $userRole = $request->user()->role;

        // Check if notes already exist for this visit
        if ($visit->visitNotes) {
            // Update existing notes
            $visit->visitNotes->update([
                'dentist_notes_encrypted' => $validated['dentist_notes'] ?? $visit->visitNotes->dentist_notes_encrypted,
                'findings_encrypted' => $validated['findings'] ?? $visit->visitNotes->findings_encrypted,
                'treatment_plan_encrypted' => $validated['treatment_plan'] ?? $visit->visitNotes->treatment_plan_encrypted,
                'teeth_treated' => $validated['teeth_treated'] ?? $visit->visitNotes->teeth_treated,
                'updated_by' => $userId,
            ]);
            
            $action = 'notes_updated';
        } else {
            // Create new notes
            $visit->visitNotes()->create([
                'dentist_notes_encrypted' => $validated['dentist_notes'] ?? null,
                'findings_encrypted' => $validated['findings'] ?? null,
                'treatment_plan_encrypted' => $validated['treatment_plan'] ?? null,
                'teeth_treated' => $validated['teeth_treated'] ?? null,
                'created_by' => $userId,
            ]);
            
            $action = 'notes_created';
        }

        // Log the notes save action
        SystemLog::create([
            'category' => 'visit',
            'action' => $action,
            'message' => "Dentist notes saved for visit #{$visit->id} by {$userRole}",
            'user_id' => $userId,
            'subject_id' => $visit->id,
            'context' => [
                'visit_id' => $visit->id,
                'patient_id' => $visit->patient_id,
                'visit_code' => $visit->visit_code,
                'user_role' => $userRole,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
        ]);

        return response()->json(['message' => 'Dentist notes saved successfully.']);
    }

    /**
     * GET /api/visits/resolve/{code}
     * Resolve visit code and return patient summary with history
     */
    public function resolveCode(Request $request, $code)
    {
        // Check authorization - only dentist, staff, or admin can resolve codes
        $user = $request->user();
        if (!in_array($user->role, ['dentist', 'staff', 'admin'])) {
            return response()->json(['message' => 'Unauthorized: Only dentists, staff, and admins can resolve visit codes.'], 403);
        }

        // Normalize the code
        $code = strtoupper(trim($code));
        
        if (empty($code)) {
            return response()->json(['message' => 'Invalid visit code.'], 422);
        }

        // Find the visit by code
        $visit = PatientVisit::with(['patient', 'service', 'visitNotes', 'appointment'])
            ->where('visit_code', $code)
            ->first();

        if (!$visit) {
            // Log failed code resolution attempt
            SystemLog::create([
                'category' => 'visit',
                'action' => 'code_resolution_failed',
                'message' => "Failed to resolve visit code: {$code} (not found)",
                'user_id' => $user->id,
                'context' => [
                    'code' => $code,
                    'user_role' => $user->role,
                    'reason' => 'code_not_found',
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ],
            ]);
            
            return response()->json(['message' => 'Visit code not found.'], 404);
        }

        // Check if visit is in allowed state
        if (!in_array($visit->status, ['pending', 'inquiry'])) {
            // Log failed code resolution attempt
            SystemLog::create([
                'category' => 'visit',
                'action' => 'code_resolution_failed',
                'message' => "Failed to resolve visit code: {$code} (inactive status: {$visit->status})",
                'user_id' => $user->id,
                'subject_id' => $visit->id,
                'context' => [
                    'code' => $code,
                    'visit_id' => $visit->id,
                    'visit_status' => $visit->status,
                    'user_role' => $user->role,
                    'reason' => 'inactive_status',
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ],
            ]);
            
            return response()->json(['message' => 'Visit code is no longer active.'], 422);
        }

        // Set consultation started time if not already set
        if (!$visit->consultation_started_at) {
            $visit->update(['consultation_started_at' => now()]);
            
            // Log the consultation start
            SystemLog::create([
                'category' => 'visit',
                'action' => 'consultation_started',
                'message' => "Consultation started for visit code: {$code}",
                'user_id' => $request->user()->id,
                'subject_id' => $visit->id,
                'context' => [
                    'visit_id' => $visit->id,
                    'patient_id' => $visit->patient_id,
                    'visit_code' => $code,
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ],
            ]);
        }

                // Get complete patient history
        $patientHistory = $visit->getCompletePatientHistory();
        
        // Get medical history for this visit (if completed)
        $medicalHistory = null;
        if ($visit->medical_history_status === 'completed' && $visit->medical_history_id) {
            $medicalHistory = PatientMedicalHistory::with('completedBy')->where('patient_visit_id', $visit->id)->first();
        }
        
        // Return minimal patient summary and history
        return response()->json([
            'visit' => [
                'id' => $visit->id,
                'visit_code' => $visit->visit_code,
                'visit_date' => $visit->visit_date,
                'start_time' => $visit->start_time,
                'consultation_started_at' => $visit->consultation_started_at,
                'status' => $visit->status,
                'medical_history_status' => $visit->medical_history_status,
            ],
            'patient' => [
                'id' => $visit->patient->id,
                'first_name' => $visit->patient->first_name,
                'last_name' => $visit->patient->last_name,
                'contact_number' => $visit->patient->contact_number,
            ],
            'service' => $visit->service ? [
                'id' => $visit->service->id,
                'name' => $visit->service->name,
            ] : null,
            'appointment' => $visit->appointment ? [
                'id' => $visit->appointment->id,
                'teeth_count' => $visit->appointment->teeth_count,
            ] : null,
            'patient_history' => $patientHistory,
            'medical_history' => $medicalHistory,
            'has_existing_notes' => $visit->visitNotes ? true : false,
        ]);
    }

    /**
     * GET /api/visits/{id}/dentist-notes
     * Get dentist notes for pre-filling staff completion form
     */
    public function getDentistNotes(Request $request, $id)
    {
        $visit = PatientVisit::with(['visitNotes','service'])->findOrFail($id);
        $userId = $request->user()->id;
        $userRole = $request->user()->role;
        $visitDate = $visit->visit_date ? $visit->visit_date->toDateString() : now()->toDateString();
        $servicePriceAtDate = $visit->service ? (float) $visit->service->getPriceForDate($visitDate) : 0.0;
        
        if (!$visit->visitNotes) {
            // Log access attempt even if no notes exist
            SystemLog::create([
                'category' => 'visit',
                'action' => 'notes_accessed',
                'message' => "Attempted to access notes for visit #{$visit->id} (no notes found) by {$userRole}",
                'user_id' => $userId,
                'subject_id' => $visit->id,
                'context' => [
                    'visit_id' => $visit->id,
                    'patient_id' => $visit->patient_id,
                    'visit_code' => $visit->visit_code,
                    'user_role' => $userRole,
                    'notes_found' => false,
                    'ip_address' => $request->ip(),
                    'user_agent' => $request->userAgent(),
                ],
            ]);
            
            return response()->json([
                'dentist_notes' => null,
                'findings' => null,
                'treatment_plan' => null,
                'teeth_treated' => null,
                'service_price_at_date' => $servicePriceAtDate,
            ]);
        }

        // Record access to existing notes
        $visit->visitNotes->recordAccess($userId);
        
        // Log the notes access
        SystemLog::create([
            'category' => 'visit',
            'action' => 'notes_accessed',
            'message' => "Accessed notes for visit #{$visit->id} by {$userRole}",
            'user_id' => $userId,
            'subject_id' => $visit->id,
            'context' => [
                'visit_id' => $visit->id,
                'patient_id' => $visit->patient_id,
                'visit_code' => $visit->visit_code,
                'user_role' => $userRole,
                'notes_found' => true,
                'notes_created_by' => $visit->visitNotes->created_by,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
        ]);

        return response()->json([
            'dentist_notes' => $visit->visitNotes->dentist_notes_encrypted,
            'findings' => $visit->visitNotes->findings_encrypted,
            'treatment_plan' => $visit->visitNotes->treatment_plan_encrypted,
            'teeth_treated' => $visit->visitNotes->teeth_treated,
            'teeth_type' => $visit->visitNotes->teeth_type,
            'is_primary_teeth' => $visit->visitNotes->is_primary_teeth,
            'teeth_treated_with_count' => $visit->visitNotes->teeth_treated_with_count,
            'created_by' => $visit->visitNotes->createdBy?->name,
            'created_at' => $visit->visitNotes->created_at,
            'updated_by' => $visit->visitNotes->updatedBy?->name,
            'updated_at' => $visit->visitNotes->updated_at,
            'service_price_at_date' => $servicePriceAtDate,
        ]);
    }

    /**
     * POST /api/visits/send-visit-code
     * Send visit code notification to a specific dentist
     */
    public function sendVisitCode(Request $request)
    {
        $validated = $request->validate([
            'visit_id' => 'required|exists:patient_visits,id',
            'dentist_id' => 'required|exists:dentist_schedules,id',
            'dentist_email' => 'required|email',
        ]);

        $visit = PatientVisit::with(['patient', 'service'])->findOrFail($validated['visit_id']);
        $dentist = DentistSchedule::findOrFail($validated['dentist_id']);

        // Verify the dentist is working today
        $today = now();
        $dayOfWeek = strtolower($today->format('D')); // sun, mon, tue, etc.
        
        if (!$dentist->{$dayOfWeek} || $dentist->status !== 'active') {
            return response()->json(['message' => 'Selected dentist is not working today.'], 422);
        }

        // Check if visit is still pending
        if ($visit->status !== 'pending') {
            return response()->json(['message' => 'Visit is no longer pending.'], 422);
        }
        
        // Check if medical history is completed
        if ($visit->medical_history_status !== 'completed') {
            return response()->json(['message' => 'Medical history must be completed before sending visit code to dentist.'], 422);
        }
        
        // Check if visit code exists
        if (!$visit->visit_code) {
            return response()->json(['message' => 'Visit code has not been generated. Please complete the medical history first.'], 422);
        }

        // Create notification for the dentist
        $notification = Notification::create([
            'type' => 'visit_code',
            'title' => "New Patient Visit - {$visit->patient->first_name} {$visit->patient->last_name}",
            'body' => "Visit Code: {$visit->visit_code}\nPatient: {$visit->patient->first_name} {$visit->patient->last_name}\nService: " . ($visit->service?->name ?? 'Not specified') . "\nStarted: " . $visit->start_time->format('M j, Y g:i A'),
            'severity' => 'info',
            'scope' => 'targeted',
            'audience_roles' => null,
            'effective_from' => now(),
            'effective_until' => null,
            'data' => [
                'visit_id' => $visit->id,
                'visit_code' => $visit->visit_code,
                'patient_name' => "{$visit->patient->first_name} {$visit->patient->last_name}",
                'service_name' => $visit->service?->name ?? 'Not specified',
                'start_time' => $visit->start_time->toISOString(),
                'dentist_id' => $dentist->id,
                'dentist_name' => $dentist->dentist_name ?? $dentist->dentist_code,
                'action_url' => "/dentist/visit/{$visit->visit_code}", // This will be handled by frontend routing
            ],
            'created_by' => $request->user()->id,
        ]);

        // Find the dentist user by email
        $dentistUser = \App\Models\User::where('email', $validated['dentist_email'])->first();
        
        if (!$dentistUser) {
            return response()->json(['message' => 'Dentist user not found with the provided email.'], 422);
        }

        // Create targeted notification for the dentist
        NotificationTarget::create([
            'notification_id' => $notification->id,
            'user_id' => $dentistUser->id,
            'user_email' => $validated['dentist_email'],
            'read_at' => null,
        ]);

        $visit->dentist_schedule_id = $dentist->id;
        $visit->visit_code_sent_at = now();
        $visit->save();

        // Log the action
        SystemLog::create([
            'category' => 'visit',
            'action' => 'visit_code_sent',
            'message' => "Visit code sent to dentist: " . ($dentist->dentist_name ?? $dentist->dentist_code),
            'user_id' => $request->user()->id,
            'subject_id' => $visit->id,
            'context' => [
                'visit_id' => $visit->id,
                'visit_code' => $visit->visit_code,
                'patient_name' => "{$visit->patient->first_name} {$visit->patient->last_name}",
                'dentist_id' => $dentist->id,
                'dentist_name' => $dentist->dentist_name ?? $dentist->dentist_code,
                'dentist_email' => $validated['dentist_email'],
                'sent_by' => $request->user()->name,
                'ip_address' => $request->ip(),
                'user_agent' => $request->userAgent(),
            ],
        ]);

        $visit->refresh()->load('assignedDentist');

        return response()->json([
            'message' => 'Visit code sent successfully to dentist.',
            'notification_id' => $notification->id,
            'dentist_name' => $dentist->dentist_name ?? $dentist->dentist_code,
            'visit' => $visit,
        ]);
    }

    // Get dashboard statistics
    public function stats()
    {
        try {
            $today = Carbon::today()->toDateString();

            // Today's visits: 
            // - All pending visits (regardless of date) to alert staff about unfinished work
            // - Plus completed visits from today
            $todayVisits = PatientVisit::where(function($query) use ($today) {
                    $query->where('status', 'pending')  // Include all pending visits
                          ->orWhere(function($q) use ($today) {
                              $q->where('visit_date', $today)
                                ->where('status', 'completed');
                          });
                })
                ->count();

            // Pending visits: all pending visits regardless of date
            $pendingVisits = PatientVisit::where('status', 'pending')
                ->count();

            return response()->json([
                'today_visits' => $todayVisits,
                'pending_visits' => $pendingVisits,
            ]);
        } catch (\Exception $e) {
            Log::error('Failed to fetch visit statistics: ' . $e->getMessage());
            return response()->json([
                'today_visits' => 0,
                'pending_visits' => 0,
            ], 500);
        }
    }

}
