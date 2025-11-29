<?php

namespace Tests\Unit;

use App\Models\DentistSchedule;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DentistHoursStorageTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_hours_are_stored_and_retrieved_correctly(): void
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

        // Reload from database
        $dentist = DentistSchedule::find($dentist->id);
        
        $hours = $dentist->getHoursForDay('mon');
        $this->assertNotNull($hours);
        $this->assertEquals('09:00', $hours['start']);
        $this->assertEquals('10:00', $hours['end']);
        
        // Check availability
        $this->assertTrue($dentist->isTimeSlotWithinHours($date, '09:00', '09:30'));
        $this->assertFalse($dentist->isTimeSlotWithinHours($date, '10:00', '10:30'));
    }
}

