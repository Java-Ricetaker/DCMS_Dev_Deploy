<?php

namespace App\Http\Controllers\API;

use Carbon\Carbon;
use App\Models\Service;
use App\Models\Appointment;
use Illuminate\Http\Request;
use App\Http\Controllers\Controller;
use App\Services\ClinicDateResolverService;
use App\Services\PreferredDentistService;
use Illuminate\Support\Facades\Auth;

class AppointmentSlotController extends Controller
{
    /**
     * Returns all valid starting time slots for a given date and service.
     * It considers the service duration, the clinic's open hours for that day,
     * and the current usage of each 30-minute slot based on existing appointments.
     */
    public function get(Request $request, ClinicDateResolverService $resolver)
    {
        $data = $request->validate([
            'date' => 'required|date_format:Y-m-d',
            'service_id' => 'nullable|integer|exists:services,id',
        ]);

        // Resolve patient context (supports staff-provided patient_id)
        $effectivePatientId = $request->filled('patient_id')
            ? (int) $request->query('patient_id')
            : optional(\App\Models\Patient::byUser(Auth::id()))?->id;

        $patient = $effectivePatientId ? \App\Models\Patient::find($effectivePatientId) : null;

        $date = Carbon::createFromFormat('Y-m-d', $data['date'])->startOfDay();
        $snap = $resolver->resolve($date);
        if (!$snap['is_open']) {
            // keep the shape the frontend expects
            return response()->json(['slots' => []]);
        }

        $patientBlockedSlots = [];
        $preferredDentist = null;
        $preferredDentistId = null;
        if ($patient) {
            $patientBlockedSlots = Appointment::getBlockedTimeSlotsForPatient($patient->id, $data['date']);

            /** @var PreferredDentistService $prefService */
            $prefService = app(PreferredDentistService::class);
            $preferredDentist = $prefService->resolveForPatient($patient->id, $date);
            $preferredDentistId = $preferredDentist?->id;
        }

        $requestedHonorPreferred = $request->has('honor_preferred_dentist')
            ? $request->boolean('honor_preferred_dentist')
            : true;

        $preferredDentistActive = $preferredDentistId
            ? in_array($preferredDentistId, $snap['active_dentist_ids'] ?? [], true)
            : false;

        $effectiveHonorPreferred = $requestedHonorPreferred && $preferredDentistId && $preferredDentistActive;

        // Determine time range for building blocks
        // If honoring preferred dentist and they have custom hours, use those; otherwise use clinic hours
        $openTime = $snap['open_time'];
        $closeTime = $snap['close_time'];
        
        if ($effectiveHonorPreferred && $preferredDentist) {
            // Reload dentist to ensure all attributes including custom hours are loaded
            $preferredDentist = \App\Models\DentistSchedule::find($preferredDentist->id);
            $weekday = strtolower($date->format('D')); // 'mon', 'tue', etc.
            try {
                $dentistHours = $preferredDentist->getHoursForDay($weekday);
                if ($dentistHours && isset($dentistHours['start']) && isset($dentistHours['end']) 
                    && !empty($dentistHours['start']) && !empty($dentistHours['end'])) {
                    // Use dentist's custom schedule hours
                    $openTime = $dentistHours['start'];
                    $closeTime = $dentistHours['end'];
                }
            } catch (\Exception $e) {
                // If there's an error getting dentist hours, fallback to clinic hours
                // Log the error for debugging but continue with clinic hours
                \Log::warning('Error getting preferred dentist hours', [
                    'dentist_id' => $preferredDentist->id,
                    'weekday' => $weekday,
                    'error' => $e->getMessage()
                ]);
            }
        }
        
        // Ensure we have valid times before building blocks
        if (empty($openTime) || empty($closeTime)) {
            return response()->json(['slots' => []]);
        }

        // Build 30-min grid from open/close (strings like "08:00" .. "17:00")
        // This will use either clinic hours or preferred dentist's custom hours
        try {
            $blocks = ClinicDateResolverService::buildBlocks($openTime, $closeTime);
        } catch (\Exception $e) {
            \Log::error('Error building blocks in AppointmentSlotController', [
                'open_time' => $openTime,
                'close_time' => $closeTime,
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString()
            ]);
            return response()->json(['error' => 'Error generating time slots: ' . $e->getMessage()], 500);
        }
        $usage  = Appointment::slotUsageForDate($date->toDateString(), $blocks);

        $cap = (int) $snap['effective_capacity'];

        // Determine how many blocks the requested service needs (default 1 if none)
        $requiredBlocks = 1;
        if (!empty($data['service_id'])) {
            $service = Service::findOrFail($data['service_id']);
            $requiredBlocks = max(1, (int) ceil(($service->estimated_minutes ?? 30) / 30));
        }

        $dentistUsage = Appointment::dentistSlotUsageForDate($date->toDateString());

        // Return every start time whose covered blocks stay strictly below cap
        $valid = [];
        foreach ($blocks as $start) {
            $startCarbon = Carbon::createFromFormat('H:i', $start);
            $globalCursor = $startCarbon->copy();
            $endCarbon = $startCarbon->copy();
            $ok = true;

            // Check capacity constraints (global)
            for ($i = 0; $i < $requiredBlocks; $i++) {
                $k = $globalCursor->format('H:i');
                if (!array_key_exists($k, $usage) || $usage[$k] >= $cap) {
                    $ok = false;
                    break;
                }
                $globalCursor->addMinutes(30);
            }

            if (!$ok) {
                continue;
            }

            $endCarbon = $globalCursor;

            // Enforce dentist-specific availability when honoring preference
            if ($effectiveHonorPreferred) {
                $dentistCursor = $startCarbon->copy();
                for ($i = 0; $i < $requiredBlocks; $i++) {
                    $slotKey = $dentistCursor->format('H:i');
                    if (($dentistUsage[$preferredDentistId][$slotKey] ?? 0) >= 1) {
                        $ok = false;
                        break;
                    }
                    $dentistCursor->addMinutes(30);
                }
            }

            if (!$ok) {
                continue;
            }

            // Check for patient-specific overlaps if patient exists
            if ($patient && !empty($patientBlockedSlots)) {
                $proposedTimeSlot = $start . '-' . $endCarbon->format('H:i');

                if (Appointment::hasOverlappingAppointment($patient->id, $data['date'], $proposedTimeSlot)) {
                    $ok = false;
                }
            }

            if ($ok) {
                $valid[] = $start; // "HH:MM"
            }
        }

        // Filter out past time slots if the requested date is today
        try {
            $today = now()->startOfDay();
            $requestedDateStr = $date->format('Y-m-d');
            $todayDateStr = $today->format('Y-m-d');
            
            if ($requestedDateStr === $todayDateStr) {
                $now = now();
                // Calculate the next 30-minute block from current time
                // Always move to the next available block (e.g., 10:00 → 10:30, 1:16 → 1:30)
                // Strategy: add 30 minutes, then round down to nearest 30-minute boundary
                $currentHour = (int)$now->format('H');
                $currentMinute = (int)$now->format('i');
                $currentMinutes = $currentHour * 60 + $currentMinute;
                $nextBlockMinutes = floor(($currentMinutes + 30) / 30) * 30;
                
                // Handle overflow (e.g., if we're past 23:30, next block would be tomorrow)
                if ($nextBlockMinutes >= 1440) {
                    // No slots available today, show empty list
                    $valid = [];
                } else {
                    // Calculate hours and minutes for the next block
                    $nextBlockHour = (int)floor($nextBlockMinutes / 60);
                    $nextBlockMinute = (int)($nextBlockMinutes % 60);
                    
                    // Format as HH:MM string directly
                    $minAllowedTimeString = sprintf('%02d:%02d', $nextBlockHour, $nextBlockMinute);
                    
                    // Filter out slots before the minimum allowed time
                    $valid = array_filter($valid, function($slot) use ($minAllowedTimeString) {
                        return $slot >= $minAllowedTimeString;
                    });
                    
                    // Re-index the array to remove gaps
                    $valid = array_values($valid);
                }
            }
        } catch (\Exception $e) {
            // Log error but don't fail the entire request - continue with unfiltered slots
            \Log::error('Error filtering same-day time slots', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
                'date' => $date->format('Y-m-d') ?? 'unknown'
            ]);
        }

        return response()->json([
            'slots' => $valid,
            'snapshot' => [
                'effective_capacity' => $snap['effective_capacity'],
                'calendar_max_per_block' => $snap['calendar_max_per_block'],
                'capacity_override' => $snap['capacity_override'],
                'dentist_count' => $snap['dentist_count'],
                'dentists' => $snap['dentists'],
                'active_dentist_ids' => $snap['active_dentist_ids'],
            ],
            'usage' => [
                'global' => $usage,
                'per_dentist' => $dentistUsage,
            ],
            'metadata' => [
                'preferred_dentist_id' => $preferredDentistId,
                'preferred_dentist_active' => $preferredDentistActive,
                'requested_honor_preferred_dentist' => $requestedHonorPreferred,
                'effective_honor_preferred_dentist' => $effectiveHonorPreferred,
                'preferred_dentist' => $preferredDentist ? [
                    'id' => $preferredDentist->id,
                    'code' => $preferredDentist->dentist_code,
                    'name' => $preferredDentist->dentist_name,
                ] : null,
                'patient_blocked_slots' => $patientBlockedSlots,
            ],
        ]);
    }

}
