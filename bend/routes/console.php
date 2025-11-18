<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Scheduled Tasks
// Run every 15 minutes to check for appointments that are 15 minutes late
Schedule::command('appointments:mark-no-shows')->everyFifteenMinutes();
Schedule::command('goals:update-progress')->dailyAt('01:15');
Schedule::command('promos:auto-cancel-expired')->dailyAt('02:00');

// Retry queued emails every 5 minutes
Schedule::command('emails:retry-queued --limit=20')->everyFiveMinutes();

// Send appointment reminder emails daily at 6am Manila time
Schedule::job(new \App\Jobs\EmailAppointmentReminderJob)->dailyAt('06:00');

// Add the inventory scan near expiry command
Schedule::command('inventory:scan-near-expiry')->dailyAt('08:00');
Schedule::command('patients:archive-inactive')->dailyAt('03:30');

Artisan::command('mail:test', function () {
    $recipient = config('mail.from.address');
    $subject = 'Mailtrap API Test Email';

    Mail::mailer(config('mail.default'))
        ->raw('This is a test email sent via the configured Mailtrap API mailer.', function ($message) use ($recipient, $subject) {
            $message->to($recipient)
                ->subject($subject);
        });

    $this->info(sprintf(
        'Test email dispatched via "%s" mailer to %s',
        config('mail.default'),
        $recipient ?? 'the configured recipient'
    ));
})->purpose('Send a test email using the current mailer configuration');

