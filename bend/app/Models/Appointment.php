<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;

// RefundRequest is in the same namespace, so no use statement needed

class Appointment extends Model
{
    use HasFactory;

    // Cancellation reason constants
    public const CANCELLATION_REASON_PATIENT_REQUEST = 'patient_request';
    public const CANCELLATION_REASON_ADMIN_CANCELLATION = 'admin_cancellation';
    public const CANCELLATION_REASON_HEALTH_SAFETY_CONCERN = 'health_safety_concern';
    public const CANCELLATION_REASON_CLINIC_CANCELLATION = 'clinic_cancellation';
    public const CANCELLATION_REASON_MEDICAL_CONTRAINDICATION = 'medical_contraindication';
    public const CANCELLATION_REASON_OTHER = 'other';

    protected $fillable = [
        'patient_id',
        'service_id',
        'patient_hmo_id',
        'date',
        'time_slot',
        'reference_code',
        'status',
        'payment_method',
        'payment_status',
        'notes',
        'teeth_count',
        'receipt_sent_at',
        'receipt_sent_to',
        'is_seeded',
        'cancellation_reason',
        'treatment_adjustment_notes',
        'dentist_schedule_id',
        'honor_preferred_dentist',
    ];

    protected $casts = [
        'honor_preferred_dentist' => 'boolean',
    ];

    public function patient()
    {
        return $this->belongsTo(Patient::class);
    }

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function payments()
    {
        return $this->hasMany(\App\Models\Payment::class);
    }

    public function latestPayment()
    {
        return $this->hasOne(\App\Models\Payment::class)->latestOfMany();
    }

    public function refundRequest()
    {
        return $this->hasOne(RefundRequest::class);
    }

    public function dentistSchedule()
    {
        return $this->belongsTo(DentistSchedule::class);
    }

    // Helper method to calculate total cost for per-teeth services
    public function calculateTotalCost(): float
    {
        if (!$this->service) {
            return 0;
        }

        // Use price effective on the appointment date (handles promos/discounts)
        $date = $this->date ?: now()->toDateString();
        $unitPrice = (float) $this->service->getPriceForDate($date);

        if (!$this->service->per_teeth_service) {
            return $unitPrice;
        }

        $teethCount = (int) ($this->teeth_count ?? 0);
        return $unitPrice * max(0, $teethCount);
    }

    // Helper method to calculate estimated time for this appointment
    public function calculateEstimatedTime(): int
    {
        if (!$this->service) {
            return 30; // Default fallback
        }

        return $this->service->calculateEstimatedMinutes($this->teeth_count);
    }

    // Helper method to get formatted teeth count display
    public function getFormattedTeethCountAttribute(): string
    {
        if (!$this->teeth_count || $this->teeth_count <= 0) {
            return '';
        }

        return $this->teeth_count . ' tooth' . ($this->teeth_count > 1 ? 's' : '');
    }

    /**
     * Check if a patient has any overlapping appointments on a given date
     * This prevents the same patient from booking multiple appointments that overlap in time
     */
    public static function hasOverlappingAppointment(int $patientId, string $date, string $newTimeSlot): bool
    {
        // Get all existing appointments for this patient on this date
        $existingAppointments = self::where('patient_id', $patientId)
            ->where('date', $date)
            ->whereIn('status', ['pending', 'approved', 'completed'])
            ->get(['time_slot']);

        if ($existingAppointments->isEmpty()) {
            return false;
        }

        // Parse the new appointment time slot
        if (strpos($newTimeSlot, '-') === false) {
            return false; // Invalid format
        }

        [$newStart, $newEnd] = explode('-', $newTimeSlot, 2);
        $newStartTime = \Carbon\Carbon::createFromFormat('H:i', trim($newStart));
        $newEndTime = \Carbon\Carbon::createFromFormat('H:i', trim($newEnd));

        // Check each existing appointment for overlap
        foreach ($existingAppointments as $existing) {
            if (!$existing->time_slot || strpos($existing->time_slot, '-') === false) {
                continue;
            }

            [$existingStart, $existingEnd] = explode('-', $existing->time_slot, 2);
            $existingStartTime = \Carbon\Carbon::createFromFormat('H:i', trim($existingStart));
            $existingEndTime = \Carbon\Carbon::createFromFormat('H:i', trim($existingEnd));

            // Check for overlap: new appointment starts before existing ends AND new appointment ends after existing starts
            if ($newStartTime->lt($existingEndTime) && $newEndTime->gt($existingStartTime)) {
                return true; // Overlap found
            }
        }

        return false; // No overlap
    }

    /**
     * Get all blocked time slots for a patient on a given date
     * Returns an array of time ranges that are already booked by this patient
     */
    public static function getBlockedTimeSlotsForPatient(int $patientId, string $date): array
    {
        $appointments = self::where('patient_id', $patientId)
            ->where('date', $date)
            ->whereIn('status', ['pending', 'approved', 'completed'])
            ->get(['time_slot']);

        $blockedSlots = [];
        foreach ($appointments as $appointment) {
            if ($appointment->time_slot && strpos($appointment->time_slot, '-') !== false) {
                $blockedSlots[] = $appointment->time_slot;
            }
        }

        return $blockedSlots;
    }

    /**
     * Check if two time slots overlap
     * Returns true if the time slots have any overlap
     */
    public static function hasTimeSlotOverlap(string $timeSlot1, string $timeSlot2): bool
    {
        if (strpos($timeSlot1, '-') === false || strpos($timeSlot2, '-') === false) {
            return false; // Invalid format
        }

        [$start1, $end1] = explode('-', $timeSlot1, 2);
        [$start2, $end2] = explode('-', $timeSlot2, 2);

        $startTime1 = \Carbon\Carbon::createFromFormat('H:i', trim($start1));
        $endTime1 = \Carbon\Carbon::createFromFormat('H:i', trim($end1));
        $startTime2 = \Carbon\Carbon::createFromFormat('H:i', trim($start2));
        $endTime2 = \Carbon\Carbon::createFromFormat('H:i', trim($end2));

        // Check for overlap: first appointment starts before second ends AND first appointment ends after second starts
        return $startTime1->lt($endTime2) && $endTime1->gt($startTime2);
    }

    /**
     * Build a map of per-dentist slot usage for a given date.
     *
     * @return array<int, array<string, int>> dentist_schedule_id => [ 'HH:MM' => count ]
     */
    public static function dentistSlotUsageForDate(string $date, ?int $excludeAppointmentId = null): array
    {
        $appointments = self::where('date', $date)
            ->whereIn('status', ['pending', 'approved', 'completed'])
            ->whereNotNull('dentist_schedule_id')
            ->when($excludeAppointmentId, function ($query) use ($excludeAppointmentId) {
                $query->where('id', '!=', $excludeAppointmentId);
            })
            ->get(['dentist_schedule_id', 'time_slot']);

        $usage = [];

        foreach ($appointments as $appointment) {
            if (!$appointment->time_slot || strpos($appointment->time_slot, '-') === false) {
                continue;
            }

            [$startRaw, $endRaw] = explode('-', $appointment->time_slot, 2);
            try {
                $cursor = self::carbonFromFlexibleTime(trim($startRaw));
                $end = self::carbonFromFlexibleTime(trim($endRaw));
            } catch (\Throwable $e) {
                continue;
            }

            while ($cursor->lt($end)) {
                $key = $cursor->format('H:i');
                $usage[$appointment->dentist_schedule_id][$key] = ($usage[$appointment->dentist_schedule_id][$key] ?? 0) + 1;
                $cursor->addMinutes(30);
            }
        }

        return $usage;
    }

    /**
     * Build global slot usage for a date (all appointments regardless of dentist).
     *
     * @param  array<int, string>  $blocks
     * @return array<string, int>
     */
    public static function slotUsageForDate(string $date, array $blocks, ?int $excludeAppointmentId = null): array
    {
        $usage = array_fill_keys($blocks, 0);

        $appointments = self::where('date', $date)
            ->whereIn('status', ['pending', 'approved', 'completed'])
            ->when($excludeAppointmentId, function ($query) use ($excludeAppointmentId) {
                $query->where('id', '!=', $excludeAppointmentId);
            })
            ->get(['time_slot']);

        foreach ($appointments as $appointment) {
            if (!$appointment->time_slot || strpos($appointment->time_slot, '-') === false) {
                continue;
            }

            [$startRaw, $endRaw] = explode('-', $appointment->time_slot, 2);
            try {
                $cursor = self::carbonFromFlexibleTime(trim($startRaw));
                $end = self::carbonFromFlexibleTime(trim($endRaw));
            } catch (\Throwable $e) {
                continue;
            }

            while ($cursor->lt($end)) {
                $key = $cursor->format('H:i');
                if (array_key_exists($key, $usage)) {
                    $usage[$key] += 1;
                }
                $cursor->addMinutes(30);
            }
        }

        return $usage;
    }

    /**
     * Convert a flexible time string (HH:MM or HH:MM:SS) into a Carbon instance.
     */
    protected static function carbonFromFlexibleTime(string $time): \Carbon\Carbon
    {
        return (strlen($time) === 8)
            ? \Carbon\Carbon::createFromFormat('H:i:s', $time)
            : \Carbon\Carbon::createFromFormat('H:i', $time);
    }
}
