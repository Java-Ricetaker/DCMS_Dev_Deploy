<?php

namespace Tests\Unit;

use App\Models\DentistSchedule;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DentistTestSetupVerificationTest extends TestCase
{
    use RefreshDatabase;

    public function test_dentist_a_has_correct_hours_for_monday(): void
    {
        $bookingDate = Carbon::now()->addDays(2)->startOfDay();
        while ($bookingDate->dayOfWeek !== Carbon::MONDAY) {
            $bookingDate->addDay();
        }

        $dentistA = DentistSchedule::create([
            'dentist_code' => 'DENTA',
            'dentist_name' => 'Dentist A',
            'email' => 'denta@example.test',
            'status' => 'active',
            'employment_type' => 'full_time',
            'is_pseudonymous' => false,
            'mon' => true,
            'mon_start_time' => '09:00',
            'mon_end_time' => '10:00',
        ]);

        // Reload from database to ensure we get fresh data
        $dentistA = DentistSchedule::find($dentistA->id);

        $this->assertTrue((bool) $dentistA->mon, 'Dentist A should work on Monday');
        
        $hours = $dentistA->getHoursForDay('mon');
        $this->assertNotNull($hours, 'Dentist A should have hours for Monday');
        $this->assertEquals('09:00', $hours['start'], 'Dentist A should start at 09:00');
        $this->assertEquals('10:00', $hours['end'], 'Dentist A should end at 10:00');

        // Test availability checks
        $this->assertTrue($dentistA->isTimeSlotWithinHours($bookingDate, '09:00', '09:30'), 
            'Dentist A should be available 09:00-09:30');
        $this->assertFalse($dentistA->isTimeSlotWithinHours($bookingDate, '10:00', '10:30'), 
            'Dentist A should NOT be available 10:00-10:30');
        $this->assertFalse($dentistA->isTimeSlotWithinHours($bookingDate, '09:30', '10:30'), 
            'Dentist A should NOT be available 09:30-10:30 (extends beyond hours)');
    }

    public function test_dentist_b_has_no_specific_hours(): void
    {
        $bookingDate = Carbon::now()->addDays(2)->startOfDay();
        while ($bookingDate->dayOfWeek !== Carbon::MONDAY) {
            $bookingDate->addDay();
        }

        $dentistB = DentistSchedule::create([
            'dentist_code' => 'DENTB',
            'dentist_name' => 'Dentist B',
            'email' => 'dentb@example.test',
            'status' => 'active',
            'employment_type' => 'full_time',
            'is_pseudonymous' => false,
            'mon' => true,
            // No specific hours - should be available all day
        ]);

        // Reload from database
        $dentistB = DentistSchedule::find($dentistB->id);

        $this->assertTrue((bool) $dentistB->mon, 'Dentist B should work on Monday');
        
        $hours = $dentistB->getHoursForDay('mon');
        $this->assertNull($hours, 'Dentist B should have no specific hours (null)');

        // Should be available at any time
        $this->assertTrue($dentistB->isTimeSlotWithinHours($bookingDate, '08:00', '08:30'), 
            'Dentist B should be available 08:00-08:30');
        $this->assertTrue($dentistB->isTimeSlotWithinHours($bookingDate, '10:00', '10:30'), 
            'Dentist B should be available 10:00-10:30');
        $this->assertTrue($dentistB->isTimeSlotWithinHours($bookingDate, '14:00', '14:30'), 
            'Dentist B should be available 14:00-14:30');
    }
}

