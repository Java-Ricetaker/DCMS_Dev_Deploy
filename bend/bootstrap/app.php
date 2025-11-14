<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        // Enable trusted proxies middleware for proper IP detection
        $middleware->trustProxies(at: '*');
        
        // Enable session + encryption for web routes (CSRF needs this)
        $middleware->web(prepend: [
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Session\Middleware\StartSession::class,
            \Illuminate\View\Middleware\ShareErrorsFromSession::class,
            \Illuminate\Foundation\Http\Middleware\ValidateCsrfToken::class, // ✅ required for CSRF protection
        ]);

        $middleware->api(prepend: [
            \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
            \Illuminate\Cookie\Middleware\EncryptCookies::class,
            \Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse::class,
            \Illuminate\Session\Middleware\StartSession::class,
        ]);

        // Add account status check middleware to authenticated API routes
        $middleware->alias([
            'check.account.status' => \App\Http\Middleware\CheckAccountStatus::class,
            'patient.verified' => \App\Http\Middleware\EnsurePatientEmailIsVerified::class,
        ]);

        // // Enable Sanctum for API authentication
        // $middleware->api(prepend: [
        //     \Laravel\Sanctum\Http\Middleware\EnsureFrontendRequestsAreStateful::class,
        // ]);
    })
    ->withExceptions(function (Exceptions $exceptions) {
        // Ensure we always return a valid HTTP response, even on errors
        $exceptions->render(function (\Throwable $e, \Illuminate\Http\Request $request) {
            // For health check endpoint, always return 200 even on errors
            if ($request->is('up') || $request->is('health')) {
                return response()->json(['status' => 'error', 'message' => $e->getMessage()], 200);
            }
            
            // Better error reporting for debugging
            if (config('app.debug')) {
                if ($request->expectsJson()) {
                    return response()->json([
                        'message' => $e->getMessage(),
                        'file' => $e->getFile(),
                        'line' => $e->getLine(),
                        'trace' => $e->getTraceAsString(),
                    ], 500);
                }
            }
        });
    })->create();
