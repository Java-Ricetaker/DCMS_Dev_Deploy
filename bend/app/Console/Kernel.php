<?php

namespace App\Console;

use App\Console\Commands\SimulatePaymentSuccess;
use Illuminate\Console\Scheduling\Schedule;
use Illuminate\Foundation\Console\Kernel as ConsoleKernel;

class Kernel extends ConsoleKernel
{
    /**
     * The Artisan commands provided by your application.
     *
     * @var array<int, class-string>
     */
    protected $commands = [
        SimulatePaymentSuccess::class,
    ];

    /**
     * Define the application's command schedule.
     */
    protected function schedule(Schedule $schedule): void
    {
        // Run every 15 minutes to check for appointments that are 15 minutes late
        $schedule->command('appointments:mark-no-shows')->everyFifteenMinutes();
        $schedule->command('goals:update-progress')->dailyAt('01:15');
        $schedule->command('promos:auto-cancel-expired')->dailyAt('02:00');
        $schedule->command('patients:archive-inactive')->dailyAt('03:30');
        
        // Retry queued emails every 5 minutes
        $schedule->command('emails:retry-queued --limit=20')->everyFiveMinutes();
        
        // Send appointment reminder emails daily at 6am Manila time
        $schedule->job(new \App\Jobs\EmailAppointmentReminderJob)->dailyAt('06:00');

        // Add the inventory scan near expiry command
        $schedule->command('inventory:scan-near-expiry')->dailyAt('08:00');
        
        // Check refund deadlines daily
        $schedule->command('refunds:check-deadlines')->dailyAt('09:00');
    }

    /**
     * Register the commands for the application.
     */
    protected function commands(): void
    {
        $this->load(__DIR__.'/Commands');
    }
}

