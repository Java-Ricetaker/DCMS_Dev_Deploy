<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Route;
use Illuminate\Foundation\Auth\EmailVerificationRequest;
use App\Http\Controllers\Auth\AuthenticatedSessionController;


// Serve the built SPA at root
Route::get('/', function () {
    try {
        $indexPath = public_path('index.html');
        if (!File::exists($indexPath)) {
            return response('Frontend not built. Please run: npm run build in the fend directory and commit the built files.', 500)
                ->header('Content-Type', 'text/plain');
        }
        return response()->file($indexPath, [
            'Content-Type' => 'text/html; charset=utf-8',
        ]);
    } catch (\Exception $e) {
        \Log::error('Error serving index.html: ' . $e->getMessage());
        return response('Error loading application', 500)
            ->header('Content-Type', 'text/plain');
    }
});

Route::post('/login', [AuthenticatedSessionController::class, 'store']);

Route::get('/email/verify/{id}/{hash}', function (EmailVerificationRequest $request) {
    $request->fulfill(); // ✅ mark user as verified
    return redirect(config('app.frontend_url') . '/verify-success'); // 🔁 redirect to frontend
})->middleware(['auth:sanctum', 'signed'])->name('verification.verify.legacy');

// Serve the built SPA for any path that is NOT /api, /sanctum, /storage, /assets, or /verify-email
Route::get('/{any}', function () {
    try {
        $indexPath = public_path('index.html');
        if (!File::exists($indexPath)) {
            return response('Frontend not built. Please run: npm run build in the fend directory and commit the built files.', 500)
                ->header('Content-Type', 'text/plain');
        }
        return response()->file($indexPath, [
            'Content-Type' => 'text/html; charset=utf-8',
        ]);
    } catch (\Exception $e) {
        \Log::error('Error serving index.html: ' . $e->getMessage());
        return response('Error loading application', 500)
            ->header('Content-Type', 'text/plain');
    }
})->where('any', '^(?!api)(?!sanctum)(?!storage)(?!assets)(?!verify-email)(?!up).*$');

require __DIR__.'/auth.php';
