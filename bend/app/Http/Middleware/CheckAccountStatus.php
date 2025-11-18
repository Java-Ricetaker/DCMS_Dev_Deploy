<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class CheckAccountStatus
{
    /**
     * Handle an incoming request.
     *
     * @param  \Closure(\Illuminate\Http\Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next): Response
    {
        if (Auth::check()) {
            /** @var \App\Models\User $user */
            $user = Auth::user();
            
            // Check if user account is deactivated
            if ($user->isDeactivated()) {
                // For API routes with Sanctum, we don't need to logout since we're returning 403
                // The session invalidation is not needed for API routes
                if ($request->expectsJson() || $request->is('api/*')) {
                    return response()->json([
                        'status' => 'error',
                        'message' => 'This account is deactivated. If you think this is a mistake, please contact the clinic.',
                        'account_deactivated' => true,
                    ], 403);
                }

                // For web routes, logout and redirect
                Auth::logout();
                $request->session()->invalidate();
                $request->session()->regenerateToken();
                
                return redirect('/login')->with('error', 'This account is deactivated. If you think this is a mistake, please contact the clinic.');
            }

            if ($user->role === 'patient') {
                $patient = $user->patient()->first();
                if ($patient && $patient->archived_at) {
                    if ($request->expectsJson() || $request->is('api/*')) {
                        return response()->json([
                            'status' => 'error',
                            'message' => 'This account has been archived due to inactivity. Please contact the clinic to regain access.',
                            'archived' => true,
                        ], 423);
                    }

                    Auth::logout();
                    $request->session()->invalidate();
                    $request->session()->regenerateToken();

                    return redirect('/login')->with('error', 'This account has been archived due to inactivity. Please contact the clinic to regain access.');
                }
            }
        }

        return $next($request);
    }
}
