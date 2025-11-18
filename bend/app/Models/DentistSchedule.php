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
    ];

    protected $casts = [
        'is_pseudonymous' => 'boolean',
        'contract_end_date' => 'date:Y-m-d',
        'password_changed' => 'boolean',
        'password_changed_at' => 'datetime',
        'sun' => 'boolean','mon' => 'boolean','tue' => 'boolean','wed' => 'boolean',
        'thu' => 'boolean','fri' => 'boolean','sat' => 'boolean',
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
