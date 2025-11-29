<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\DentistSchedule;
use App\Models\ClinicWeeklySchedule;
use App\Models\User;
use App\Services\SystemLogService;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Carbon\Carbon;

class DentistScheduleController extends Controller
{
    public function index(Request $request)
    {
        // Optional filter by status; always return a PLAIN ARRAY for the UI.
        $q = DentistSchedule::query();
        if ($request->filled('status')) {
            $q->where('status', $request->string('status'));
        }
        $items = $q->orderBy('dentist_code')->get();   // ← not paginate()
        return response()->json($items);               // ← []
    }

    public function show($id)
    {
        return response()->json(DentistSchedule::findOrFail($id));
    }

    public function store(Request $request)
    {
        $data = $this->validatedData($request, isUpdate: false);
        $row  = DentistSchedule::create($data);
        
        return response()->json($row, 201);
    }

    public function update(Request $request, $id)
    {
        $row  = DentistSchedule::findOrFail($id);
        $data = $this->validatedData($request, isUpdate: true, currentId: $row->id);
        
        $row->update($data);
        
        return response()->json($row);
    }


    public function destroy($id)
    {
        $row = DentistSchedule::findOrFail($id);
        $row->delete();
        return response()->noContent(); // 204
    }

    /**
     * Get the current authenticated dentist's schedule
     */
    public function mySchedule(Request $request)
    {
        $user = $request->user();
        
        if (!$user || $user->role !== 'dentist') {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $dentistSchedule = DentistSchedule::where('email', $user->email)->first();
        
        if (!$dentistSchedule) {
            return response()->json(['message' => 'Dentist schedule not found'], 404);
        }

        return response()->json($dentistSchedule);
    }

    /**
     * Get available dentists for a specific date
     */
    public function availableForDate(Request $request)
    {
        $request->validate([
            'date' => 'required|date_format:Y-m-d'
        ]);

        $date = $request->date;
        $dentists = DentistSchedule::activeOnDate($date)
            ->select('dentist_code', 'dentist_name')
            ->orderBy('dentist_code')
            ->get();

        return response()->json([
            'date' => $date,
            'dentists' => $dentists,
            'count' => $dentists->count()
        ]);
    }

    private function validatedData(Request $request, bool $isUpdate, ?int $currentId = null): array
    {
        $days = ['sun','mon','tue','wed','thu','fri','sat'];

        $rules = [
            // Frontend expects code REQUIRED & UNIQUE; name optional (pseudonymous allowed)
            'dentist_code'      => ['required','string','max:32', Rule::unique('dentist_schedules','dentist_code')->ignore($currentId)],
            'dentist_name'      => ['nullable','string','max:120'],
            'is_pseudonymous'   => ['nullable','boolean'],

            // Frontend sends 'full_time' | 'part_time' | 'locum'
            'employment_type'   => ['required', Rule::in(['full_time','part_time','locum'])],

            'contract_end_date' => ['nullable','date','after_or_equal:today'],
            'status'            => ['required', Rule::in(['active','inactive'])],
            
            // Email fields
            'email'             => ['required','email','max:255', Rule::unique('dentist_schedules','email')->ignore($currentId)],
        ];

        // Weekdays as booleans (not required, UI sends them; we default later)
        foreach ($days as $d) {
            $rules[$d] = ['nullable','boolean'];
        }

        // Time fields for each day (nullable, time format)
        foreach ($days as $d) {
            $rules["{$d}_start_time"] = ['nullable', 'date_format:H:i'];
            $rules["{$d}_end_time"] = ['nullable', 'date_format:H:i'];
        }

        $data = $request->validate($rules);

        // Normalize booleans (default false) and pseudonym flag (default true)
        foreach ($days as $d) {
            $data[$d] = (bool) ($request->boolean($d));
        }
        $data['is_pseudonymous'] = (bool) ($data['is_pseudonymous'] ?? true);
        
        // Email is required, no need to handle nullable

        // Enforce: at least one working day must be selected
        $hasAny = false;
        foreach ($days as $d) {
            if ($data[$d] === true) { $hasAny = true; break; }
        }
        if (!$hasAny) {
            abort(response()->json([
                'message' => 'Select at least one working day.',
                'errors'  => ['weekdays' => ['Select at least one working day.']],
            ], 422));
        }

        // Validate time logic and clinic hours constraints
        $this->validateDentistHoursAgainstClinic($data, $days);

        return $data;
    }

    /**
     * Validate dentist hours against clinic operating hours
     * - Ensures end_time > start_time for each day
     * - Ensures dentist hours fall within clinic hours (if clinic is open)
     */
    private function validateDentistHoursAgainstClinic(array &$data, array $days): void
    {
        // Map weekday keys to weekday numbers (0=Sun, 6=Sat)
        $weekdayMap = [
            'sun' => 0, 'mon' => 1, 'tue' => 2, 'wed' => 3,
            'thu' => 4, 'fri' => 5, 'sat' => 6,
        ];

        $errors = [];

        foreach ($days as $day) {
            $isWorking = $data[$day] ?? false;
            $startTime = $data["{$day}_start_time"] ?? null;
            $endTime = $data["{$day}_end_time"] ?? null;

            // Skip validation if day is not selected
            if (!$isWorking) {
                // Clear times if day is not selected
                $data["{$day}_start_time"] = null;
                $data["{$day}_end_time"] = null;
                continue;
            }

            // If times are provided, both must be present
            if (($startTime && !$endTime) || (!$startTime && $endTime)) {
                $errors["{$day}_times"] = ["Both start and end times must be provided for {$day}, or leave both empty."];
                continue;
            }

            // If times are provided, validate logic
            if ($startTime && $endTime) {
                $start = Carbon::createFromFormat('H:i', $startTime);
                $end = Carbon::createFromFormat('H:i', $endTime);

                // Validate end > start
                if ($end->lte($start)) {
                    $errors["{$day}_times"] = ["End time must be after start time for {$day}."];
                    continue;
                }

                // Validate against clinic hours
                $weekdayNum = $weekdayMap[$day];
                $clinicSchedule = ClinicWeeklySchedule::where('weekday', $weekdayNum)->first();

                if ($clinicSchedule && $clinicSchedule->is_open) {
                    $clinicOpen = $clinicSchedule->open_time ? Carbon::createFromFormat('H:i', substr($clinicSchedule->open_time, 0, 5)) : null;
                    $clinicClose = $clinicSchedule->close_time ? Carbon::createFromFormat('H:i', substr($clinicSchedule->close_time, 0, 5)) : null;

                    if ($clinicOpen && $clinicClose) {
                        // Check if dentist start time is before clinic open
                        if ($start->lt($clinicOpen)) {
                            $errors["{$day}_start_time"] = ["Dentist start time for {$day} must be within clinic hours ({$clinicSchedule->open_time} - {$clinicSchedule->close_time})."];
                        }

                        // Check if dentist end time is after clinic close
                        if ($end->gt($clinicClose)) {
                            $errors["{$day}_end_time"] = ["Dentist end time for {$day} must be within clinic hours ({$clinicSchedule->open_time} - {$clinicSchedule->close_time})."];
                        }
                    }
                } elseif ($clinicSchedule && !$clinicSchedule->is_open) {
                    // Clinic is closed on this day, but dentist is set to work
                    $errors[$day] = ["Clinic is closed on {$day}. Dentist cannot be scheduled on closed days."];
                }
            }
            // If no times provided, that's fine - dentist works during clinic hours
        }

        if (!empty($errors)) {
            abort(response()->json([
                'message' => 'Validation failed for dentist schedule hours.',
                'errors' => $errors,
            ], 422));
        }
    }

}
