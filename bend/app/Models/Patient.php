<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Support\Facades\Log;
use App\Services\PreferredDentistService;
use Carbon\Carbon;

class Patient extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'first_name',
        'last_name',
        'middle_name',
        'birthdate',
        'sex',
        'contact_number',
        'address',
        'is_linked',
        'flag_manual_review',
        'recent_ip_addresses',
        'last_login_at',
        'last_login_ip',
        'policy_history_id',
        'policy_accepted_at',
        'archived_at',
        'archived_by',
        'archived_reason',
    ];

    protected $casts = [
        'birthdate' => 'date',
        'is_linked' => 'boolean',
        'flag_manual_review' => 'boolean',
        'recent_ip_addresses' => 'array',
        'last_login_at' => 'datetime',
        'policy_accepted_at' => 'datetime',
        'archived_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function hmos()
    {
        return $this->hasMany(PatientHmo::class);
    }

    public function patientManager()
    {
        return $this->hasOne(PatientManager::class);
    }

    public function acceptedPolicy(): BelongsTo
    {
        return $this->belongsTo(PolicyHistory::class, 'policy_history_id');
    }

    public function archivedBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'archived_by');
    }

    public function feedbackResponses()
    {
        return $this->hasMany(PatientFeedback::class);
    }

    public function appointments()
    {
        return $this->hasMany(Appointment::class);
    }

    public function completedVisits(): HasMany
    {
        return $this->hasMany(PatientVisit::class)->where('patient_visits.status', 'completed');
    }

    public function latestCompletedVisit(): HasOne
    {
        return $this->hasOne(PatientVisit::class)
            ->where('patient_visits.status', 'completed')
            ->orderByDesc('visit_date')
            ->orderByDesc('id');
    }

    public function scopeWithLastVisitDate(Builder $query): Builder
    {
        return $query->addSelect([
            'last_visit_date' => PatientVisit::select('visit_date')
                ->whereColumn('patient_visits.patient_id', 'patients.id')
                ->where('patient_visits.status', 'completed')
                ->latest('visit_date')
                ->limit(1),
        ]);
    }

    public function getLastVisitDateAttribute(): ?Carbon
    {
        if (array_key_exists('last_visit_date', $this->attributes)) {
            $value = $this->attributes['last_visit_date'];
            return $value ? Carbon::parse($value) : null;
        }

        $visit = $this->latestCompletedVisit()->select('visit_date')->first();

        return $visit?->visit_date ? Carbon::parse($visit->visit_date) : null;
    }

    public static function byUser($userId)
    {
        return self::where('user_id', $userId)
            ->where('is_linked', true)
            ->first();
    }

    /**
     * Find potential matching patients by name
     * Used to detect duplicates when updating walk-in patient information
     */
    public static function findPotentialMatches($firstName, $lastName, $excludeId = null)
    {
        // Trim names to handle whitespace properly
        $firstName = trim($firstName);
        $lastName = trim($lastName);

        // Case-insensitive match (more efficient than redundant LIKE clause)
        $query = self::whereRaw('LOWER(first_name) = LOWER(?)', [$firstName])
              ->whereRaw('LOWER(last_name) = LOWER(?)', [$lastName]);

        if ($excludeId) {
            $query->where('id', '!=', $excludeId);
        }

        return $query->with(['user'])->get();
    }

    /**
     * Track IP address for this patient (only valid public IPs)
     */
    public function trackIpAddress($ipAddress)
    {
        // Validate IP address before tracking
        if (!$this->isValidPublicIp($ipAddress)) {
            return; // Skip tracking invalid IPs
        }

        $recentIps = $this->recent_ip_addresses ?? [];
        
        // Remove the IP if it already exists to avoid duplicates
        $recentIps = array_filter($recentIps, function($ip) use ($ipAddress) {
            return $ip['ip'] !== $ipAddress;
        });
        
        // Add the new IP to the beginning
        array_unshift($recentIps, [
            'ip' => $ipAddress,
            'first_seen' => now()->toISOString(),
            'last_seen' => now()->toISOString(),
        ]);
        
        // Keep only the last 10 IP addresses
        $recentIps = array_slice($recentIps, 0, 10);
        
        $this->update([
            'recent_ip_addresses' => $recentIps,
            'last_login_ip' => $ipAddress,
            'last_login_at' => now(),
        ]);
    }

    /**
     * Check if an IP address is a valid public IP for tracking
     */
    private function isValidPublicIp(string $ip): bool
    {
        // Filter out invalid IPs
        if (empty($ip) || $ip === 'unknown' || $ip === '::1') {
            return false;
        }

        // Filter out localhost and private IP ranges
        $invalidRanges = [
            '127.0.0.0/8',      // 127.0.0.0 to 127.255.255.255 (localhost)
            '10.0.0.0/8',       // 10.0.0.0 to 10.255.255.255 (private)
            '172.16.0.0/12',    // 172.16.0.0 to 172.31.255.255 (private)
            '192.168.0.0/16',   // 192.168.0.0 to 192.168.255.255 (private)
            '169.254.0.0/16',   // 169.254.0.0 to 169.254.255.255 (link-local)
            '0.0.0.0/8',        // 0.0.0.0 to 0.255.255.255 (reserved)
        ];

        foreach ($invalidRanges as $range) {
            if ($this->ipInRange($ip, $range)) {
                return false;
            }
        }

        // Check if it's a valid IPv4 address
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4) !== false;
    }

    /**
     * Check if an IP address is within a CIDR range
     */
    private function ipInRange(string $ip, string $range): bool
    {
        list($subnet, $bits) = explode('/', $range);
        
        $ipLong = ip2long($ip);
        $subnetLong = ip2long($subnet);
        $mask = -1 << (32 - $bits);
        
        return ($ipLong & $mask) === ($subnetLong & $mask);
    }

    /**
     * Get recent IP addresses with timestamps
     */
    public function getRecentIpAddresses()
    {
        return $this->recent_ip_addresses ?? [];
    }

    /**
     * Get the most recent IP address
     */
    public function getLastLoginIp()
    {
        return $this->last_login_ip;
    }

    /**
     * Resolve the patient's most recently associated dentist schedule.
     */
    public function preferredDentistSchedule(?Carbon $referenceDate = null): ?DentistSchedule
    {
        /** @var PreferredDentistService $service */
        $service = app(PreferredDentistService::class);

        return $service->resolveForPatient($this->id, $referenceDate);
    }

    public function preferredDentistScheduleId(?Carbon $referenceDate = null): ?int
    {
        return $this->preferredDentistSchedule($referenceDate)?->id;
    }

    protected static function boot()
    {
        parent::boot();

        static::deleting(function ($patient) {
            Log::info('🗑️ PATIENT: About to delete patient ID: ' . $patient->id . ', Name: ' . $patient->first_name . ' ' . $patient->last_name);
        });

        static::deleted(function ($patient) {
            Log::info('🗑️ PATIENT: Deleted patient ID: ' . $patient->id . ', Name: ' . $patient->first_name . ' ' . $patient->last_name);
        });
    }
}
