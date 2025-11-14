<?php

use Illuminate\Http\Request;
use App\Http\Middleware\AdminOnly;
use App\Http\Middleware\AdminOrStaff;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\API\MayaController;

use App\Http\Controllers\API\PatientController;
use App\Http\Controllers\API\ServiceController;
use App\Http\Controllers\API\ServiceCategoryController;
use App\Http\Middleware\EnsureDeviceIsApproved;
use App\Http\Controllers\DeviceStatusController;

use App\Http\Controllers\API\InventoryController;
use App\Http\Controllers\API\PatientHmoController;

use App\Http\Controllers\API\AppointmentController;
use App\Http\Controllers\API\NotificationController;
use App\Http\Controllers\Auth\NewPasswordController;
use App\Http\Controllers\API\InventoryItemController;
use App\Http\Controllers\Admin\StaffAccountController;
use App\Http\Controllers\API\ClinicCalendarController;
use App\Http\Controllers\Staff\PatientVisitController;
use App\Http\Controllers\API\AppointmentSlotController;
use App\Http\Controllers\API\PatientEmailVerificationController;

use App\Http\Controllers\API\DentistScheduleController;
use App\Http\Controllers\API\ServiceDiscountController;
use App\Http\Controllers\Auth\RegisteredUserController;
use App\Http\Controllers\Admin\DeviceApprovalController;
use App\Http\Controllers\API\InventorySettingsController;
use App\Http\Controllers\API\AppointmentServiceController;
use App\Http\Controllers\Auth\PasswordResetLinkController;
use App\Http\Controllers\API\ClinicWeeklyScheduleController;
use App\Http\Controllers\Auth\AuthenticatedSessionController;
use App\Http\Controllers\Admin\SystemLogController;
use App\Http\Controllers\Admin\PaymentRecordController;
use App\Http\Controllers\Admin\QueuedEmailsController;
use App\Http\Controllers\Admin\RefundRequestController;
use App\Http\Controllers\Admin\RefundSettingsController;
use App\Http\Controllers\Admin\PolicySettingsController;
use App\Http\Controllers\API\ReportController;
use App\Http\Controllers\API\GoalController;
use App\Http\Controllers\API\DentistUserController;
use App\Http\Controllers\API\DentistPasswordController;
use App\Http\Controllers\API\ReceiptController;
use App\Http\Middleware\DentistAuthMiddleware;
use App\Http\Middleware\DentistPasswordChangeMiddleware;
use App\Http\Controllers\API\PolicyConsentController;

// ------------------------
// Public auth routes
// ------------------------
Route::post('/register', [RegisteredUserController::class, 'store'])->middleware('throttle:3,10');
Route::post('/login', [AuthenticatedSessionController::class, 'store'])->middleware('throttle:10,1');
Route::post('/logout', [AuthenticatedSessionController::class, 'destroy']);

Route::post('/forgot-password', [PasswordResetLinkController::class, 'store'])->middleware('throttle:3,60');
Route::post('/reset-password', [NewPasswordController::class, 'store']);

// Send password reset link for authenticated users
Route::post('/send-password-reset', [PasswordResetLinkController::class, 'sendForAuthenticatedUser'])
    ->middleware(['auth:sanctum', 'throttle:3,60']);

// ------------------------
// Authenticated user profile (moved inside authenticated routes group)
// ------------------------

// ------------------------
// Admin-only routes
// ------------------------
Route::middleware(['auth:sanctum', 'check.account.status', AdminOnly::class])->group(function () {
    // Pending device approvals
    Route::get('/admin/pending-devices', [DeviceApprovalController::class, 'index']);
    Route::post('/admin/approve-device', [DeviceApprovalController::class, 'approve']);
    Route::post('/admin/reject-device', [DeviceApprovalController::class, 'reject']);

    // Approved device management
    Route::get('/approved-devices', [DeviceApprovalController::class, 'approvedDevices']);
    Route::put('/rename-device', [DeviceApprovalController::class, 'renameDevice']);
    Route::post('/revoke-device', [DeviceApprovalController::class, 'revokeDevice']);

    // Staff account management
    Route::prefix('admin/staff')->group(function () {
        Route::get('/', [StaffAccountController::class, 'index']);
        Route::post('/', [StaffAccountController::class, 'store']);
        Route::get('/{id}', [StaffAccountController::class, 'show']);
        Route::post('/{id}/toggle-status', [StaffAccountController::class, 'toggleStatus']);
    });

    // Patient manager (no-show tracking and warnings)
    Route::prefix('admin/patient-manager')->group(function () {
        Route::get('/', [\App\Http\Controllers\Admin\PatientManagerController::class, 'index']);
        Route::get('/statistics', [\App\Http\Controllers\Admin\PatientManagerController::class, 'getStatistics']);
        Route::get('/{id}', [\App\Http\Controllers\Admin\PatientManagerController::class, 'show']);
        Route::get('/{id}/no-show-history', [\App\Http\Controllers\Admin\PatientManagerController::class, 'getNoShowHistory']);
        Route::post('/{id}/send-warning', [\App\Http\Controllers\Admin\PatientManagerController::class, 'sendWarning']);
        Route::post('/{id}/block', [\App\Http\Controllers\Admin\PatientManagerController::class, 'blockPatient']);
        Route::post('/{id}/unblock', [\App\Http\Controllers\Admin\PatientManagerController::class, 'unblockPatient']);
        Route::post('/{id}/add-note', [\App\Http\Controllers\Admin\PatientManagerController::class, 'addNote']);
        Route::post('/{id}/reset-no-shows', [\App\Http\Controllers\Admin\PatientManagerController::class, 'resetNoShowCount']);
    });

    // Patient-User Binding
    Route::prefix('admin/patient-binding')->group(function () {
        Route::get('/unlinked-patients', [PatientController::class, 'searchUnlinkedPatients']);
        Route::get('/unlinked-users', [PatientController::class, 'searchUnlinkedUsers']);
        Route::post('/bind', [PatientController::class, 'bindPatientToUser']);
    });

    // Payment records (search and view receipts)
    Route::prefix('admin/payment-records')->group(function () {
        Route::get('/', [PaymentRecordController::class, 'index']);
        Route::get('/{paymentId}/receipt-data', [PaymentRecordController::class, 'getReceiptData']);
    });

    // Refund settings
    Route::prefix('admin/refund-settings')->group(function () {
        Route::get('/', [RefundSettingsController::class, 'show']);
        Route::patch('/', [RefundSettingsController::class, 'update']);
    });

    // Policy settings
    Route::prefix('admin/policy-settings')->group(function () {
        Route::get('/', [PolicySettingsController::class, 'show']);
        Route::put('/', [PolicySettingsController::class, 'update']);
        Route::get('/history', [PolicySettingsController::class, 'history']);
        Route::get('/history/{id}', [PolicySettingsController::class, 'showHistory']);
    });

    // Service management
    Route::post('/services', [ServiceController::class, 'store']);
    Route::put('/services/{service}', [ServiceController::class, 'update']);
    Route::delete('/services/{service}', [ServiceController::class, 'destroy']);

    // Service category management
    Route::get('/service-categories', [ServiceCategoryController::class, 'index']);
    Route::post('/service-categories', [ServiceCategoryController::class, 'store']);
    Route::put('/service-categories/{category}', [ServiceCategoryController::class, 'update']);
    Route::delete('/service-categories/{category}', [ServiceCategoryController::class, 'destroy']);

    // Service discount management
    Route::get('/services/{service}/discounts', [ServiceDiscountController::class, 'index']);
    Route::post('/services/{service}/discounts', [ServiceDiscountController::class, 'store']);
    Route::put('/discounts/{id}', [ServiceDiscountController::class, 'update']);
    Route::post('/discounts/{id}/launch', [ServiceDiscountController::class, 'launch']);
    Route::post('/discounts/{id}/cancel', [ServiceDiscountController::class, 'cancel']);
    Route::get('/discounts-overview', [ServiceDiscountController::class, 'allActivePromos']);
    Route::get('/discounts-archive', [ServiceDiscountController::class, 'archive']);
    Route::get('/service-discounts', [ServiceDiscountController::class, 'allDiscounts']);

    // Clinic calendar management
    Route::prefix('clinic-calendar')->group(function () {
        Route::get('/', [ClinicCalendarController::class, 'index']);
        Route::post('/', [ClinicCalendarController::class, 'store']);

        // ID-based CRUD (numeric)
        Route::put('/{id}', [ClinicCalendarController::class, 'update'])->whereNumber('id');
        Route::delete('/{id}', [ClinicCalendarController::class, 'destroy'])->whereNumber('id');

        // Capacity window + per-day upsert
        Route::get('/daily', [ClinicCalendarController::class, 'daily']);
        Route::put('/day/{date}', [ClinicCalendarController::class, 'upsertDay'])
            ->where('date', '\d{4}-\d{2}-\d{2}');

        Route::put('/{date}/closure', [ClinicCalendarController::class, 'setClosure']);
    });


    // Weekly schedule
    Route::get('/weekly-schedule', [ClinicWeeklyScheduleController::class, 'index']);
    Route::patch('/weekly-schedule/{id}', [ClinicWeeklyScheduleController::class, 'update']);

    // Dentist schedules (capacity source) — keep simple paths
    Route::post('/dentists', [DentistScheduleController::class, 'store']);
    Route::get('/dentists/available-for-date', [DentistScheduleController::class, 'availableForDate']);
    Route::get('/dentists/{id}', [DentistScheduleController::class, 'show']);
    Route::put('/dentists/{id}', [DentistScheduleController::class, 'update']);
    Route::delete('/dentists/{id}', [DentistScheduleController::class, 'destroy']);
    

    //inventory
    Route::post('/inventory/adjust', [InventoryController::class, 'adjust']);
    Route::patch('/inventory/settings', [InventorySettingsController::class, 'update']);

    // System logs
    Route::prefix('system-logs')->group(function () {
        Route::get('/', [SystemLogController::class, 'index']);
        Route::get('/filter-options', [SystemLogController::class, 'filterOptions']);
        Route::get('/statistics', [SystemLogController::class, 'statistics']);
        Route::get('/{systemLog}', [SystemLogController::class, 'show']);
    });

    // SMS testing
    Route::post('/admin/test-sms', [NotificationController::class, 'testSms']);

    // Reports
    Route::prefix('reports')->group(function () {
        Route::get('/visits-monthly', [ReportController::class, 'visitsMonthly']);
        Route::get('/visits-daily', [ReportController::class, 'visitsDaily']);
    });

    // Analytics summary
    Route::get('/analytics/summary', [ReportController::class, 'analyticsSummary']);
    Route::get('/analytics/comparison', [ReportController::class, 'analyticsComparison']);
    Route::get('/analytics/trend', [ReportController::class, 'analyticsTrend']);
    Route::get('/analytics/promotion-opportunities', [ReportController::class, 'promotionOpportunities']);
    Route::get('/analytics/test-insights', [ReportController::class, 'testInsights']);

    // Performance goals
    Route::prefix('goals')->group(function () {
        Route::post('/', [GoalController::class, 'store']);
        Route::get('/', [GoalController::class, 'index']);
        Route::get('/{id}/progress', [GoalController::class, 'progress'])->whereNumber('id');
    });

    // Time block utilization dashboard
    Route::get('/admin/time-block-utilization', [\App\Http\Controllers\API\TimeBlockUtilizationController::class, 'getUtilizationData']);

    // Queued emails management
    Route::prefix('admin/queued-emails')->group(function () {
        Route::get('/', [QueuedEmailsController::class, 'index']);
        Route::get('/stats', [QueuedEmailsController::class, 'stats']);
        Route::post('/retry-all', [QueuedEmailsController::class, 'retryAll']);
    });

    // Dentist account management
    Route::prefix('dentist')->group(function () {
        Route::post('/create-account', [DentistUserController::class, 'createAccount']);
        Route::put('/change-email', [DentistUserController::class, 'changeEmail']);
        Route::get('/status/{dentist_schedule_id}', [DentistUserController::class, 'status']);
        Route::post('/reset-password', [DentistPasswordController::class, 'resetPassword']);
    });
});

// ------------------------
// Admin and Staff routes (refund management)
// ------------------------
Route::middleware(['auth:sanctum', 'check.account.status', AdminOrStaff::class])->group(function () {
    // Refund management (accessible to both admin and staff)
    Route::prefix('admin/refund-requests')->group(function () {
        Route::get('/', [RefundRequestController::class, 'index']);
        Route::post('/', [RefundRequestController::class, 'store']);
        Route::get('/{id}', [RefundRequestController::class, 'show']);
        Route::post('/{id}/approve', [RefundRequestController::class, 'approve']);
        Route::post('/{id}/reject', [RefundRequestController::class, 'reject']);
        Route::post('/{id}/process', [RefundRequestController::class, 'process']);
        Route::post('/{id}/extend-deadline', [RefundRequestController::class, 'extendDeadline']);
        Route::post('/{id}/complete', [RefundRequestController::class, 'complete']);
    });

    Route::get('/patients/{patient}/preferred-dentist', [PatientController::class, 'preferredDentist'])
        ->whereNumber('patient');
});

// ------------------------
// Authenticated routes (any logged-in user)
// ------------------------
Route::middleware(['auth:sanctum', 'check.account.status'])->group(function () {
    Route::get('/policy/consent', [PolicyConsentController::class, 'show']);
    Route::post('/policy/consent/accept', [PolicyConsentController::class, 'accept']);

    // User profile endpoint
    Route::get('/user', function (Request $request) {
        $user = $request->user()->load('patient');
        
        $warningStatus = false;
        if ($user->patient) {
            $patientManager = \App\Models\PatientManager::where('patient_id', $user->patient->id)->first();
            if ($patientManager && $patientManager->isUnderWarning()) {
                $warningStatus = true;
            }
        }

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'email_verified_at' => $user->email_verified_at,
            'contact_number' => $user->contact_number,
            'role' => $user->role,
            'status' => $user->status,
            'patient' => $user->patient,
            'is_linked' => optional($user->patient)->is_linked ?? false,
            'warning_status' => $warningStatus,
        ]);
    });

    // Allow patients to resend or update verification email even if not yet verified
    Route::post('/patient/verification/resend', [PatientEmailVerificationController::class, 'resend'])
        ->middleware('throttle:2,10');

    // Staff device status
    Route::get('/device-status', [DeviceStatusController::class, 'check']);
    Route::post('/staff/change-password', [\App\Http\Controllers\Staff\StaffAccountController::class, 'changePassword']);

    // Clinic calendar resolve
    Route::get('/clinic-calendar/resolve', [ClinicCalendarController::class, 'resolve']);
    Route::get('/clinic-calendar/alerts', [ClinicCalendarController::class, 'upcomingClosures']);
    Route::get('/me/closure-impacts', [ClinicCalendarController::class, 'myClosureImpacts']);

    // Appointment (patient side)
    Route::middleware('patient.verified')->group(function () {
        Route::prefix('appointment')->group(function () {
            Route::get('/available-services', [AppointmentServiceController::class, 'availableServices']);
            Route::get('/check-blocked-status', [AppointmentController::class, 'checkBlockedStatus']);
            Route::get('/debug-auth', [AppointmentController::class, 'debugAuth']); // Debug endpoint
            Route::post('/', [AppointmentController::class, 'store']);
            Route::get('/available-slots', [AppointmentSlotController::class, 'get']);
            Route::post('/{id}/cancel', [AppointmentController::class, 'cancel']);
            Route::post('/{id}/reschedule', [AppointmentController::class, 'reschedule']);
            Route::get('/resolve/{code}', [AppointmentController::class, 'resolveReferenceCode']);
        });


        // HMO verification and notification by staff/admin (per appointment)
        Route::post('/appointments/{id}/hmo/reveal', [AppointmentController::class, 'revealHmo']);
        Route::post('/appointments/{id}/hmo/notify', [AppointmentController::class, 'notifyHmoCoverage']);

        Route::get('/patients', [PatientController::class, 'index']);

        // Patient linking
        Route::post('/patients/link-self', [PatientController::class, 'linkSelf']);

        // Patient's own appointments
        Route::get('/user-appointments', [AppointmentController::class, 'userAppointments']);
        Route::get('/user-visit-history', [AppointmentController::class, 'userVisitHistory']);
        Route::prefix('refunds')->group(function () {
            Route::get('/pending-claims', [\App\Http\Controllers\API\PatientRefundController::class, 'pendingClaims']);
            Route::post('/{id}/confirm', [\App\Http\Controllers\API\PatientRefundController::class, 'confirm']);
        });


        // Receipt generation
        Route::prefix('receipts')->group(function () {
            Route::get('/appointment/{appointmentId}', [ReceiptController::class, 'generateAppointmentReceipt']);
            Route::get('/visit/{visitId}', [ReceiptController::class, 'generateVisitReceipt']);
            Route::post('/appointment/{appointmentId}/email', [ReceiptController::class, 'sendReceiptEmail']);
            Route::post('/visit/{visitId}/email', [ReceiptController::class, 'sendVisitReceiptEmail']);
        });

        // Notifications
        Route::get('/notifications', [NotificationController::class, 'index'])->middleware('throttle:30,1');
        Route::get('/notifications/unread-count', [NotificationController::class, 'unreadCount'])->middleware('throttle:30,1');
        Route::post('/notifications/mark-all-read', [NotificationController::class, 'markAllRead']);
        Route::get('/notifications/mine', [NotificationController::class, 'mine'])->middleware('throttle:30,1');

        Route::prefix('inventory')->group(function () {

            Route::get('/items', [InventoryItemController::class, 'index']);
            Route::post('/items', [InventoryItemController::class, 'store']);

            Route::post('/receive', [InventoryController::class, 'receive']);
            Route::post('/consume', [InventoryController::class, 'consume']);

            Route::get('/settings', [InventorySettingsController::class, 'show']);

            Route::put('/items/{item}', [InventoryItemController::class, 'update']);
            Route::delete('/items/{item}', [InventoryItemController::class, 'destroy']);
            Route::get('/items/{item}/batches', [InventoryController::class, 'batches']);
            Route::get('/suppliers', [InventoryController::class, 'suppliers']);
            Route::post('/suppliers', [InventoryController::class, 'storeSupplier']);
        });

        // Create payment (user must be logged in)
        Route::post('/maya/payments', [MayaController::class, 'createPayment']);

        // If you prefer status behind auth, keep it here instead of public:
        Route::get('/maya/payments/{paymentId}/status', [MayaController::class, 'status']);
        Route::post('/maya/payments/{paymentId}/refund', [MayaController::class, 'refund']);

        // HMO
        Route::get('/patients/{patient}/hmos', [PatientHmoController::class, 'index'])->name('hmos.index');
        Route::post('/patients/{patient}/hmos', [PatientHmoController::class, 'store'])->name('hmos.store');
        Route::put('/patients/{patient}/hmos/{hmo}', [PatientHmoController::class, 'update'])->name('hmos.update');
        Route::delete('/patients/{patient}/hmos/{hmo}', [PatientHmoController::class, 'destroy'])->name('hmos.destroy');
    });

    // Dentist email verification routes removed - no longer needed
});

// ------------------------
// Staff routes (only if device is approved)
// ------------------------
Route::middleware(['auth:sanctum', 'check.account.status', EnsureDeviceIsApproved::class])->group(function () {
    // Payment records (staff can also access)
    Route::prefix('staff/payment-records')->group(function () {
        Route::get('/', [PaymentRecordController::class, 'index']);
        Route::get('/{paymentId}/receipt-data', [PaymentRecordController::class, 'getReceiptData']);
    });

    // Patients

    Route::post('/patients', [PatientController::class, 'store']);
    Route::post('/patients/{patient}/link', [PatientController::class, 'linkToUser']);
    Route::post('/patients/{id}/flag', [PatientController::class, 'flagReview']);
    Route::get('/patients/search', [PatientController::class, 'search']);

    // Patient-User Binding (also accessible to staff)
    Route::prefix('staff/patient-binding')->group(function () {
        Route::get('/unlinked-patients', [PatientController::class, 'searchUnlinkedPatients']);
        Route::get('/unlinked-users', [PatientController::class, 'searchUnlinkedUsers']);
        Route::post('/bind', [PatientController::class, 'bindPatientToUser']);
    });

    // Visits
    Route::prefix('visits')->group(function () {
        Route::get('/', [PatientVisitController::class, 'index']);
        Route::get('/stats', [PatientVisitController::class, 'stats']);
        Route::post('/', [PatientVisitController::class, 'store']);
        Route::post('/{id}/finish', [PatientVisitController::class, 'finish']);
        Route::post('/{id}/complete-with-details', [PatientVisitController::class, 'completeWithDetails']);
        Route::post('/{id}/reject', [PatientVisitController::class, 'reject']);
        Route::put('/{id}/update-patient', [PatientVisitController::class, 'updatePatient']);
        Route::get('/{visit}/potential-matches', [PatientVisitController::class, 'getPotentialMatches']);
        Route::post('/{visit}/link-existing', [PatientVisitController::class, 'linkToExistingPatient']);
        Route::post('/{id}/view-notes', [PatientVisitController::class, 'viewNotes']);
        Route::post('/send-visit-code', [PatientVisitController::class, 'sendVisitCode']);
        Route::get('/{id}/medical-history-form', [PatientVisitController::class, 'getMedicalHistoryForm']);
        Route::post('/{id}/medical-history', [PatientVisitController::class, 'submitMedicalHistory']);
        Route::get('/{id}/medical-history', [PatientVisitController::class, 'getMedicalHistory']);
        
        // Visit code resolution and notes (accessible to staff and dentists)
        Route::get('/resolve/{code}', [PatientVisitController::class, 'resolveCode'])->middleware('throttle:10,1');
        Route::post('/{id}/save-dentist-notes', [PatientVisitController::class, 'saveDentistNotes']);
        Route::get('/{id}/dentist-notes', [PatientVisitController::class, 'getDentistNotes']);
    });

    // Staff appointment schedule
    Route::get('/staff/today-time-blocks', [AppointmentController::class, 'getTodayTimeBlocks']);

    // Dentist schedules (read-only access for staff to send visit codes)
    Route::get('/dentists', [DentistScheduleController::class, 'index']);
    Route::get('/dentists/available-for-date', [DentistScheduleController::class, 'availableForDate']);

    // Appointments (staff side)
    Route::post('/appointments/{id}/approve', [AppointmentController::class, 'approve']);
    Route::post('/appointments/{id}/reject', [AppointmentController::class, 'reject']);
    Route::get('/appointments', [AppointmentController::class, 'index']);
    Route::get('/appointments/remindable', [AppointmentController::class, 'remindable']);
    Route::post('/appointments/{id}/send-reminder', [AppointmentController::class, 'sendReminder']);
    Route::get('/appointments/resolve-exact', [AppointmentController::class, 'resolveExact']);
    Route::post('/appointments/staff-create', [AppointmentController::class, 'storeForStaff']);
});

// ------------------------
// Public service routes (read-only) - NO AUTH REQUIRED
// ------------------------
Route::get('/public/services', [ServiceController::class, 'publicIndex']);
Route::get('/public/services/{service}/discounts', [ServiceDiscountController::class, 'publicIndex']);
Route::get('/policy', [PolicySettingsController::class, 'publicShow']);

// ------------------------
// Public service routes (read-only)
// ------------------------
Route::middleware('auth:sanctum')->get('/services', [ServiceController::class, 'index']);
Route::middleware('auth:sanctum')->get('/services/{service}', [ServiceController::class, 'show']);
Route::post('/maya/webhook', [MayaController::class, 'webhook'])
    ->middleware('throttle:120,1');

Route::get('/maya/return/success', [MayaController::class, 'returnCapture'])->defaults('outcome', 'success');
Route::get('/maya/return/failure', [MayaController::class, 'returnCapture'])->defaults('outcome', 'failure');
Route::get('/maya/return/cancel', [MayaController::class, 'returnCapture'])->defaults('outcome', 'cancel');

// ------------------------
// Dentist routes (authenticated dentists only)
// ------------------------
Route::middleware(['auth:sanctum', 'check.account.status'])->prefix('dentist')->group(function () {
  Route::post('/change-password', [DentistPasswordController::class, 'changePassword']);
  Route::get('/password-status', [DentistPasswordController::class, 'checkPasswordStatus']);
  
  // Dentist schedule
  Route::get('/my-schedule', [DentistScheduleController::class, 'mySchedule']);
  Route::get('/clinic-schedule', [ClinicWeeklyScheduleController::class, 'index']);
  
  // Dentist visit notes
  Route::post('/visits/{id}/save-notes', [\App\Http\Controllers\Staff\PatientVisitController::class, 'saveDentistNotes']);
  Route::get('/visits/{id}/notes', [\App\Http\Controllers\Staff\PatientVisitController::class, 'getDentistNotes']);
});