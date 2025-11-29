<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class DentistSchedule extends Model
{
    use HasFactory;

    protected $fillable = [
        'dentist_code',
        'dentist_name',
        'is_pseudonymous',
        'employment_type',
        'contract_end_date',
        'status',
        'email',
        'temporary_password',
        'password_changed',
        'password_changed_at',
        'sun','mon','tue','wed','thu','fri','sat',
        'mon_start_time', 'mon_end_time',
        'tue_start_time', 'tue_end_time',
        'wed_start_time', 'wed_end_time',
        'thu_start_time', 'thu_end_time',
        'fri_start_time', 'fri_end_time',
        'sat_start_time', 'sat_end_time',
        'sun_start_time', 'sun_end_time',
    ];

    protected $casts = [
        'is_pseudonymous' => 'boolean',
        'contract_end_date' => 'date:Y-m-d',
        'password_changed' => 'boolean',
        'password_changed_at' => 'datetime',
        'sun' => 'boolean','mon' => 'boolean','tue' => 'boolean','wed' => 'boolean',
        'thu' => 'boolean','fri' => 'boolean','sat' => 'boolean',
        'mon_start_time' => 'string', 'mon_end_time' => 'string',
        'tue_start_time' => 'string', 'tue_end_time' => 'string',
        'wed_start_time' => 'string', 'wed_end_time' => 'string',
        'thu_start_time' => 'string', 'thu_end_time' => 'string',
        'fri_start_time' => 'string', 'fri_end_time' => 'string',
        'sat_start_time' => 'string', 'sat_end_time' => 'string',
        'sun_start_time' => 'string', 'sun_end_time' => 'string',
    ];

    // ── Scopes ────────────────────────────────────────────────────────────────
    public function scopeActive($q)
    {
        return $q->where('status', 'active');
    }

    /** Filter schedules that work on a given weekday (0=Sun … 6=Sat or 'mon','tue',...) */
    public function scopeForDay($q, $day)
    {
        $map = ['sun','mon','tue','wed','thu','fri','sat'];
        if (is_int($day)) {
            $col = $map[$day] ?? null;
        } else {
            $day = strtolower($day);
            $col = in_array($day, $map, true) ? $day : substr($day, 0, 3);
        }
        return in_array($col, $map, true) ? $q->where($col, true) : $q;
    }

    /** Contract valid on or after $date (or open-ended) */
    public function scopeWithinContract($q, $date = null)
    {
        $d = $date ? Carbon::parse($date) : now();
        return $q->where(function ($w) use ($d) {
            $w->whereNull('contract_end_date')
              ->orWhereDate('contract_end_date', '>=', $d->toDateString());
        });
    }

    /** Single, authoritative scope: who counts toward capacity on $date */
    public function scopeActiveOnDate($q, $date = null)
    {
        $d = $date ? Carbon::parse($date) : now();
        $weekday = strtolower($d->format('D')); // sun..sat
        return $q->active()
                 ->withinContract($d)
                 ->where($weekday, true);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────
    /** True if THIS record counts toward capacity on $date */
    public function isAvailableOn($date): bool
    {
        $d = $date ? Carbon::parse($date) : now();
        $weekday = strtolower($d->format('D'));
        $worksToday = (bool) $this->{$weekday};

        $validContract = is_null($this->contract_end_date) || $this->contract_end_date >= $d;

        return $this->status === 'active' && $worksToday && $validContract;
    }

    /**
     * Get start and end times for a specific day
     * @param string $day Weekday key (sun, mon, tue, etc.)
     * @return array|null ['start' => 'HH:mm', 'end' => 'HH:mm'] or null if not set
     */
    public function getHoursForDay(string $day): ?array
    {
        $day = strtolower($day);
        $startKey = "{$day}_start_time";
        $endKey = "{$day}_end_time";

        // Get from attributes (raw database values)
        $start = $this->getAttribute($startKey);
        $end = $this->getAttribute($endKey);

        // Check if values are not null/empty
        if (empty($start) || empty($end) || $start === null || $end === null) {
            return null;
        }

        // Normalize to HH:mm format
        // Handle string formats (H:i or H:i:s) or Carbon instances
        if (is_string($start)) {
            // Extract HH:mm from HH:mm:ss if needed
            $start = substr($start, 0, 5);
        } elseif ($start instanceof Carbon) {
            $start = $start->format('H:i');
        }
        
        if (is_string($end)) {
            // Extract HH:mm from HH:mm:ss if needed
            $end = substr($end, 0, 5);
        } elseif ($end instanceof Carbon) {
            $end = $end->format('H:i');
        }

        return ['start' => $start, 'end' => $end];
    }

    /**
     * Check if a given time falls within this dentist's hours for a specific date
     * @param string|Carbon $date Date to check
     * @param string $time Time in HH:mm format
     * @return bool True if time is within dentist hours (or no hours set, meaning all day)
     */
    public function isTimeWithinHours($date, string $time): bool
    {
        $d = $date instanceof Carbon ? $date : Carbon::parse($date);
        $weekday = strtolower($d->format('D')); // sun, mon, tue, etc.

        // If dentist doesn't work this day, return false
        if (!(bool) $this->{$weekday}) {
            return false;
        }

        $hours = $this->getHoursForDay($weekday);

        // If no specific hours set, dentist is available all day (during clinic hours)
        if (!$hours) {
            return true;
        }

        $timeCarbon = Carbon::createFromFormat('H:i', $time);
        $startCarbon = Carbon::createFromFormat('H:i', $hours['start']);
        $endCarbon = Carbon::createFromFormat('H:i', $hours['end']);

        // Check if time is within range
        return $timeCarbon->gte($startCarbon) && $timeCarbon->lt($endCarbon);
    }

    /**
     * Check if an entire appointment time slot (start to end) falls within this dentist's hours for a specific date
     * This ensures appointments spanning multiple 30-min blocks are fully within dentist's schedule
     * @param string|Carbon $date Date to check
     * @param string|Carbon $startTime Start time in HH:mm format
     * @param string|Carbon $endTime End time in HH:mm format
     * @return bool True if entire slot is within dentist hours (or no hours set, meaning all day)
     */
    public function isTimeSlotWithinHours($date, $startTime, $endTime): bool
    {
        $d = $date instanceof Carbon ? $date : Carbon::parse($date);
        $weekday = strtolower($d->format('D')); // sun, mon, tue, etc.

        // If dentist doesn't work this day, return false
        if (!(bool) $this->{$weekday}) {
            return false;
        }

        $hours = $this->getHoursForDay($weekday);

        // If no specific hours set, dentist is available all day (during clinic hours)
        if (!$hours) {
            return true;
        }

        // Normalize start and end times to time strings (HH:mm format)
        if ($startTime instanceof Carbon) {
            $startTimeStr = $startTime->format('H:i');
        } else {
            $startTimeStr = substr($startTime, 0, 5); // Ensure HH:mm format
        }

        if ($endTime instanceof Carbon) {
            $endTimeStr = $endTime->format('H:i');
        } else {
            $endTimeStr = substr($endTime, 0, 5); // Ensure HH:mm format
        }

        // Get dentist's hours for this day
        $dentistStartStr = substr($hours['start'], 0, 5); // Ensure HH:mm format
        $dentistEndStr = substr($hours['end'], 0, 5); // Ensure HH:mm format
        $startTimeStr = substr($startTimeStr, 0, 5); // Ensure HH:mm format
        $endTimeStr = substr($endTimeStr, 0, 5); // Ensure HH:mm format

        // Use Carbon for reliable time comparison
        // Create Carbon instances for comparison (using a fixed date)
        $baseDate = Carbon::parse('2000-01-01');
        $apptStart = Carbon::createFromFormat('Y-m-d H:i', $baseDate->format('Y-m-d') . ' ' . $startTimeStr);
        $apptEnd = Carbon::createFromFormat('Y-m-d H:i', $baseDate->format('Y-m-d') . ' ' . $endTimeStr);
        $dentistStart = Carbon::createFromFormat('Y-m-d H:i', $baseDate->format('Y-m-d') . ' ' . $dentistStartStr);
        $dentistEnd = Carbon::createFromFormat('Y-m-d H:i', $baseDate->format('Y-m-d') . ' ' . $dentistEndStr);

        // Appointment start must be >= dentist start, and appointment end must be <= dentist end
        // Both conditions must be true for the entire appointment to fit within dentist hours
        return $apptStart->gte($dentistStart) && $apptEnd->lte($dentistEnd);
    }

    public static function countForDate($date): int
    {
        return static::activeOnDate($date)->count();
    }

    public static function codesForDate($date): array
    {
        // prefer code if present; else fallback to name
        return static::activeOnDate($date)
            ->pluck(DB::raw("COALESCE(dentist_code, dentist_name)"))
            ->all();
    }

    public function patientFeedback()
    {
        return $this->hasMany(PatientFeedback::class);
    }
}
