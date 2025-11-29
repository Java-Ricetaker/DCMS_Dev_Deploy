<?php

namespace Tests\Unit;

use App\Models\DentistSchedule;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DentistScheduleTimeSlotTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_with_9_to_10am_hours_rejects_10_to_10_30_appointment(): void
    {
        $date = Carbon::parse('2024-01-01'); // Monday
        $dentist = DentistSchedule::create([
            'dentist_code' => 'TEST',
            'dentist_name' => 'Test Dentist',
            'email' => 'test@test.com',
            'status' => 'active',
            'mon' => true,
            'mon_start_time' => '09:00',
            'mon_end_time' => '10:00',
        ]);

        // Appointment 10:00-10:30 should NOT be within 09:00-10:00 hours
        $result = $dentist->isTimeSlotWithinHours($date, '10:00', '10:30');
        $this->assertFalse($result, 'Appointment 10:00-10:30 should NOT be within 09:00-10:00 hours');
    }

    public function test_dentist_with_9_to_10am_hours_accepts_9_to_9_30_appointment(): void
    {
        $date = Carbon::parse('2024-01-01'); // Monday
        $dentist = DentistSchedule::create([
            'dentist_code' => 'TEST',
            'dentist_name' => 'Test Dentist',
            'email' => 'test@test.com',
            'status' => 'active',
            'mon' => true,
            'mon_start_time' => '09:00',
            'mon_end_time' => '10:00',
        ]);

        // Appointment 09:00-09:30 should be within 09:00-10:00 hours
        $result = $dentist->isTimeSlotWithinHours($date, '09:00', '09:30');
        $this->assertTrue($result, 'Appointment 09:00-09:30 should be within 09:00-10:00 hours');
    }

    public function test_dentist_with_9_to_10am_hours_rejects_9_30_to_10_30_appointment(): void
    {
        $date = Carbon::parse('2024-01-01'); // Monday
        $dentist = DentistSchedule::create([
            'dentist_code' => 'TEST',
            'dentist_name' => 'Test Dentist',
            'email' => 'test@test.com',
            'status' => 'active',
            'mon' => true,
            'mon_start_time' => '09:00',
            'mon_end_time' => '10:00',
        ]);

        // Appointment 09:30-10:30 should NOT be within 09:00-10:00 hours (extends beyond)
        $result = $dentist->isTimeSlotWithinHours($date, '09:30', '10:30');
        $this->assertFalse($result, 'Appointment 09:30-10:30 should NOT be within 09:00-10:00 hours');
    }
}

