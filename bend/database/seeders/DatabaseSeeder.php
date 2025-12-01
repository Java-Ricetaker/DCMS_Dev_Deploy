<?php

namespace Database\Seeders;

use App\Models\User;
// use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Set environment variable to prevent SMS notifications during seeding
        putenv('DB_SEEDING=true');
        
        // User::factory(10)->create();

        // User::factory()->create([
        //     'name' => 'Test User',
        //     'email' => 'test@example.com',
        // ]);
        $this->call([
            UserSeeder::class,
            ServiceCategorySeeder::class,
            ServiceSeeder::class,
            ServiceDiscountSeeder::class,
            ClinicWeeklyScheduleSeeder::class,
            PatientSeeder::class,
            DentistScheduleSeeder::class,
            ReportSeeder::class,
            NotificationLogSeeder::class, // Sample notification logs
            //AnalyticsSeeder::class, // Comprehensive 1-year analytics data
            //PerformanceGoalTestSeeder::class, // Test data for performance goals
            //ReceiptTestSeeder::class, // Test appointments for receipt functionality
            // Add other seeders here as needed
        ]);
        
        // Reset environment variable after seeding
        putenv('DB_SEEDING=false');
    }
}
