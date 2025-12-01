<?php

namespace Tests\Feature;

use App\Models\ClinicWeeklySchedule;
use App\Models\DentistSchedule;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class CurrentDayTimeSlotRestrictionTest extends TestCase
{
    use RefreshDatabase;

    protected Service $service;
    protected DentistSchedule $dentist;
    protected User $staffUser;
    protected Carbon $today;

    protected function setUp(): void
    {
        parent::setUp();

        // Set up a fixed today date for consistent testing
        $this->today = Carbon::now()->startOfDay();
        
        // Create staff user for testing (staff can create same-day appointments)
        $this->staffUser = User::create([
            'name' => 'Test Staff',
            'email' => 'staff@example.test',
            'password' => Hash::make('password'),
            'role' => 'staff',
            'status' => 'activated',
            'email_verified_at' => now(),
        ]);

        // Set up clinic schedule for today
        $this->setUpClinicSchedule($this->today);

        // Create a dentist available today
        $this->dentist = $this->createDentistSchedule('DENT001', 'Test Dentist', $this->today);

        // Create a service
        $this->service = Service::create([
            'name' => 'General Consultation',
            'description' => 'Basic check-up',
            'price' => 1000,
            'estimated_minutes' => 30,
            'per_teeth_service' => false,
            'is_special' => false,
            'is_excluded_from_analytics' => false,
            'per_tooth_minutes' => null,
        ]);
    }

    protected function tearDown(): void
    {
        // Reset Carbon's test time after each test
        Carbon::setTestNow();
        parent::tearDown();
    }

    /** @test */
    public function it_filters_slots_from_next_block_when_current_time_is_10_00_am()
    {
        // Set current time to 10:00 AM
        $testTime = $this->today->copy()->setTime(10, 0, 0);
        Carbon::setTestNow($testTime);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $this->today->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should not include 10:00 (current block)
        $this->assertNotContains('10:00', $slots);
        
        // Should include 10:30 and later slots
        $this->assertContains('10:30', $slots);
        $this->assertContains('11:00', $slots);
    }

    /** @test */
    public function it_filters_slots_from_next_block_when_current_time_is_1_16_pm()
    {
        // Set current time to 1:16 PM
        $testTime = $this->today->copy()->setTime(13, 16, 0);
        Carbon::setTestNow($testTime);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $this->today->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should not include 1:00 PM or earlier slots
        $this->assertNotContains('13:00', $slots);
        
        // Should include 1:30 PM and later slots
        $this->assertContains('13:30', $slots);
        $this->assertContains('14:00', $slots);
    }

    /** @test */
    public function it_filters_slots_when_current_time_is_on_30_minute_boundary()
    {
        // Set current time to exactly 10:30 AM (on boundary)
        $testTime = $this->today->copy()->setTime(10, 30, 0);
        Carbon::setTestNow($testTime);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $this->today->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should not include 10:30 (current block)
        $this->assertNotContains('10:30', $slots);
        
        // Should include 11:00 and later slots
        $this->assertContains('11:00', $slots);
        $this->assertContains('11:30', $slots);
    }

    /** @test */
    public function it_filters_slots_when_current_time_is_mid_block()
    {
        // Set current time to 10:15 AM (mid-block)
        $testTime = $this->today->copy()->setTime(10, 15, 0);
        Carbon::setTestNow($testTime);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $this->today->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should not include 10:00 or 10:30 (current and next block if same)
        $this->assertNotContains('10:00', $slots);
        
        // Should include 10:30 and later (next available block)
        $this->assertContains('10:30', $slots);
        $this->assertContains('11:00', $slots);
    }

    /** @test */
    public function it_does_not_filter_slots_when_date_is_tomorrow()
    {
        // Set current time to 10:00 AM
        $testTime = $this->today->copy()->setTime(10, 0, 0);
        Carbon::setTestNow($testTime);

        $tomorrow = $this->today->copy()->addDay();
        $this->setUpClinicSchedule($tomorrow);
        $this->createDentistSchedule('DENT002', 'Tomorrow Dentist', $tomorrow);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $tomorrow->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should include all available slots, no filtering
        // Check that early slots are present (they wouldn't be if filtered)
        $this->assertNotEmpty($slots);
        // The first slot should be the clinic's opening time
        $this->assertContains('09:00', $slots);
    }

    /** @test */
    public function it_does_not_filter_slots_when_date_is_later_than_today()
    {
        // Set current time to 1:00 PM
        $testTime = $this->today->copy()->setTime(13, 0, 0);
        Carbon::setTestNow($testTime);

        $nextWeek = $this->today->copy()->addDays(7);
        $this->setUpClinicSchedule($nextWeek);
        $this->createDentistSchedule('DENT003', 'Next Week Dentist', $nextWeek);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $nextWeek->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should include all available slots, no filtering
        $this->assertNotEmpty($slots);
        $this->assertContains('09:00', $slots);
    }

    /** @test */
    public function it_handles_edge_case_when_close_to_end_of_day()
    {
        // Set current time to 4:45 PM (close to closing at 5:00 PM)
        $testTime = $this->today->copy()->setTime(16, 45, 0);
        Carbon::setTestNow($testTime);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $this->today->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should not include 16:30 or earlier slots
        $this->assertNotContains('16:30', $slots);
        
        // Since current time is 16:45, next block would be 17:00
        // But clinic closes at 17:00, so there may be no slots available
        // This is expected behavior - verify that no past slots are included
        foreach ($slots as $slot) {
            $slotTime = Carbon::createFromFormat('H:i', $slot);
            // All slots should be >= 17:00 (next block after 16:45)
            $this->assertTrue(
                $slotTime->gte(Carbon::createFromFormat('H:i', '17:00')),
                "Slot $slot should be >= 17:00 when current time is 16:45"
            );
        }
    }

    /** @test */
    public function it_handles_very_late_in_day_scenario()
    {
        // Set current time to 4:50 PM
        $testTime = $this->today->copy()->setTime(16, 50, 0);
        Carbon::setTestNow($testTime);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $this->today->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should not include slots before 17:00 (next block)
        // But if clinic closes at 17:00, there might be no slots available
        $this->assertIsArray($slots);
    }

    /** @test */
    public function it_filters_correctly_when_current_time_is_early_morning()
    {
        // Set current time to 8:30 AM (before clinic opens at 9:00)
        $testTime = $this->today->copy()->setTime(8, 30, 0);
        Carbon::setTestNow($testTime);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $this->today->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should show slots from clinic opening time (9:00)
        // Since we're before opening (8:30), next block would be 9:00
        // which is when clinic opens, so it should be available
        $this->assertNotEmpty($slots);
        // The first slot should be at clinic opening time
        if (!empty($slots)) {
            $this->assertContains('09:00', $slots);
        }
    }

    /** @test */
    public function it_filters_correctly_when_current_time_is_9_05_am()
    {
        // Set current time to 9:05 AM (just after clinic opens)
        $testTime = $this->today->copy()->setTime(9, 5, 0);
        Carbon::setTestNow($testTime);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $this->today->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should not include 9:00 (current block)
        $this->assertNotContains('09:00', $slots);
        
        // Should include 9:30 and later
        $this->assertContains('09:30', $slots);
    }

    /** @test */
    public function it_works_with_multiple_slots_available()
    {
        // Set current time to 10:00 AM
        $testTime = $this->today->copy()->setTime(10, 0, 0);
        Carbon::setTestNow($testTime);

        $response = $this->actingAs($this->staffUser)->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d',
            $this->today->toDateString(),
            $this->service->id
        ));

        $response->assertStatus(200);
        $payload = $response->json();
        $slots = $payload['slots'];

        // Should have multiple slots available after 10:30
        $this->assertGreaterThan(1, count($slots));
        
        // Verify filtering: all slots should be >= 10:30
        foreach ($slots as $slot) {
            $slotTime = Carbon::createFromFormat('H:i', $slot);
            $minTime = Carbon::createFromFormat('H:i', '10:30');
            $this->assertTrue(
                $slotTime->gte($minTime),
                "Slot $slot should be >= 10:30"
            );
        }
    }

    protected function setUpClinicSchedule(Carbon $date): void
    {
        ClinicWeeklySchedule::updateOrCreate(
            ['weekday' => $date->dayOfWeek],
            [
                'is_open' => true,
                'open_time' => '09:00',
                'close_time' => '17:00',
            ]
        );
    }

    protected function createDentistSchedule(string $code, string $name, Carbon $date): DentistSchedule
    {
        $days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        $scheduleFlags = array_fill_keys($days, false);
        $scheduleFlags[strtolower($date->format('D'))] = true;

        return DentistSchedule::create(array_merge($scheduleFlags, [
            'dentist_code' => $code,
            'dentist_name' => $name,
            'employment_type' => 'full_time',
            'status' => 'active',
            'email' => strtolower($code) . '@example.test',
            'is_pseudonymous' => false,
        ]));
    }
}

