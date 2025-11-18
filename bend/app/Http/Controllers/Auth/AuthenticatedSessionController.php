<?php

namespace App\Http\Controllers\Auth;

use Illuminate\Support\Str;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use App\Http\Controllers\Controller;
use Illuminate\Support\Facades\Auth;
use App\Http\Requests\Auth\LoginRequest;
use Illuminate\Validation\ValidationException;
use App\Models\DentistSchedule;
use App\Services\SystemLogService;
use Illuminate\Support\Facades\Mail;

class AuthenticatedSessionController extends Controller
{
    /**
     * Handle an incoming authentication request.
     */
    public function store(LoginRequest $request): JsonResponse
{
    $request->validate([
        'email' => ['required', 'string', 'email'],
        'password' => ['required', 'string'],
        'device_id' => ['nullable', 'string'],
    ]);

    if (!Auth::attempt($request->only('email', 'password'), $request->boolean('remember'))) {
        // Email verification no longer required for dentists

        throw ValidationException::withMessages([
            'email' => trans('auth.failed'),
        ]);
    }

    /** @var \App\Models\User $user */
    $user = Auth::user();

    // Check if user account is deactivated
    if ($user->isDeactivated()) {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return response()->json([
            'status' => 'error',
            'message' => 'This account is deactivated. If you think this is a mistake, please contact the clinic.',
        ], 403);
    }

    // Prevent archived patient accounts from logging in
    if ($user->role === 'patient') {
        $patient = $user->patient()->first();

        if ($patient && $patient->archived_at) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'status' => 'error',
                'message' => 'This account has been archived due to inactivity. Please contact the clinic to reactivate your access.',
                'archived' => true,
            ], 423);
        }
    }

    // Check if password change is required for dentists
    if ($user->role === 'dentist') {
        $dentistSchedule = DentistSchedule::where('email', $user->email)->first();
        
        if (!$dentistSchedule) {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'status' => 'error',
                'message' => 'Dentist schedule not found',
            ], 403);
        }

        // Check if dentist status is active
        if ($dentistSchedule->status !== 'active') {
            Auth::logout();
            $request->session()->invalidate();
            $request->session()->regenerateToken();

            return response()->json([
                'status' => 'error',
                'message' => 'Your account is not active. Please contact the administrator.',
            ], 403);
        }
        
        if (!$dentistSchedule->password_changed) {
            return response()->json([
                'status' => 'success',
                'message' => 'Login successful. Password change required.',
                'user' => $user,
                'requires_password_change' => true,
            ]);
        }
    }

    if ($user->role === 'staff') {
        $fingerprint = $this->generateDeviceFingerprint($request);

        $device = DB::table('staff_device')
            ->where('user_id', $user->id)
            ->where('device_fingerprint', $fingerprint)
            ->first();

        if (!$device) {
            $code = strtoupper(Str::random(6));

            DB::table('staff_device')->insert([
                'user_id' => $user->id,
                'device_fingerprint' => $fingerprint,
                'temporary_code' => $code,
                'is_approved' => false,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    // Track IP address for patient users (only valid public IPs)
    if ($user->role === 'patient') {
        $patient = \App\Models\Patient::byUser($user->id);
        if ($patient) {
            $userIp = $this->getRealUserIp($request);
            
            // Only track valid public IP addresses
            if ($this->isValidPublicIp($userIp)) {
                $patient->trackIpAddress($userIp);
            }
        }
    }

    $request->session()->regenerate();

    // Log successful login
    SystemLogService::logAuth(
        'logged_in',
        $user->id,
        "User logged in: {$user->name} ({$user->role})",
        [
            'user_id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'role' => $user->role,
            'ip_address' => $request->ip(),
            'user_agent' => $request->userAgent()
        ]
    );

    return response()->json([
        'status' => 'success',
        'message' => 'Login successful.',
        'user' => $user,
    ]);
}



    /**
     * Destroy an authenticated session.
     */
    public function destroy(Request $request): Response
    {
        $user = Auth::user();

        // Log logout before ending session
        if ($user) {
            SystemLogService::logAuth(
                'logged_out',
                $user->id,
                "User logged out: {$user->name} ({$user->role})",
                [
                    'user_id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'role' => $user->role,
                    'ip_address' => $request->ip()
                ]
            );
        }

        Auth::guard('web')->logout();

        $request->session()->invalidate();

        $request->session()->regenerateToken();

        return response()->noContent();
    }
    private function generateDeviceFingerprint(Request $request): string
    {
        return hash('sha256', $request->ip() . '|' . $request->userAgent());
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
     * Get the real user IP address, checking proxy headers first
     */
    private function getRealUserIp(Request $request): string
    {
        // Check various headers that might contain the real IP
        $headers = [
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'HTTP_CLIENT_IP',
            'HTTP_X_CLUSTER_CLIENT_IP',
            'HTTP_FORWARDED',
        ];
        
        foreach ($headers as $header) {
            $value = $request->server->get($header);
            if ($value) {
                // X-Forwarded-For can contain multiple IPs, get the first one
                if ($header === 'HTTP_X_FORWARDED_FOR') {
                    $ips = explode(',', $value);
                    $value = trim($ips[0]);
                }
                
                // Validate the IP
                if (filter_var($value, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
                    return $value;
                }
            }
        }
        
        // Fall back to Laravel's default IP detection
        return $request->ip();
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

}
