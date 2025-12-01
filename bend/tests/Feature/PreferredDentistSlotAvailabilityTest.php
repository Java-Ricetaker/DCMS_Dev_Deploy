<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Appointment;
use App\Models\ClinicCalendar;
use App\Models\ClinicWeeklySchedule;
use App\Models\DentistSchedule;
use App\Models\Patient;
use App\Models\PatientVisit;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PreferredDentistSlotAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    protected Carbon $bookingDate;
    protected Service $service;
    protected DentistSchedule $dentistA;
    protected DentistSchedule $dentistB;
    protected User $testUser;
    protected Patient $testPatient;

    protected function setUp(): void
    {
        parent::setUp();

        // Set booking date to next Monday
        $this->bookingDate = Carbon::now()->next(Carbon::MONDAY)->startOfDay();
        if ($this->bookingDate->isToday()) {
            $this->bookingDate->addWeek();
        }

        $this->setUpClinicSchedule($this->bookingDate);

        // Create Dentist A: available Monday 9-10am only
        $this->dentistA = $this->createDentistSchedule('DENTA', 'Dentist A', $this->bookingDate);
        $this->dentistA->update([
            'mon_start_time' => '09:00',
            'mon_end_time' => '10:00',
        ]);

        // Create Dentist B: available whole clinic hours on Monday
        $this->dentistB = $this->createDentistSchedule('DENTB', 'Dentist B', $this->bookingDate);

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

        $this->testUser = User::create([
            'name' => 'Test Patient',
            'email' => 'testpatient@example.test',
            'password' => Hash::make('password'),
            'role' => 'patient',
            'status' => 'activated',
            'email_verified_at' => now(),
        ]);
        $this->testUser->markEmailAsVerified();

        $this->testPatient = Patient::create([
            'user_id' => $this->testUser->id,
            'first_name' => 'Test',
            'last_name' => 'Patient',
            'contact_number' => '09170000000',
            'is_linked' => true,
        ]);

        if ($activePolicyId = AppSetting::get('policy.active_history_id')) {
            $this->testPatient->update([
                'policy_history_id' => $activePolicyId,
                'policy_accepted_at' => now(),
            ]);
        }

        // Establish preferred dentist (Dentist A) for test patient via a previous visit
        PatientVisit::create([
            'patient_id' => $this->testPatient->id,
            'visit_date' => $this->bookingDate->copy()->subDay()->toDateString(),
            'dentist_schedule_id' => $this->dentistA->id,
            'visit_code_sent_at' => now(),
        ]);
    }

    /**
     * Scenario 1: Patients fully booked 9-10am (2 patients).
     * All existing patients have honor_preferred_dentist = false.
     * A patient with honor_preferred_dentist ON for Dentist A should NOT see any available slots
     * for their preferred dentist (9:00 and 9:30) because Dentist A is already booked.
     */
    public function test_scenario_1_no_slots_when_preferred_dentist_fully_booked(): void
    {
        // Create a service that takes 60 minutes (2 blocks)
        $twoBlockService = Service::create([
            'name' => 'Two Block Service',
            'description' => 'Service that takes 60 minutes (2 blocks)',
            'price' => 2000,
            'estimated_minutes' => 60,
            'per_teeth_service' => false,
            'is_special' => false,
            'is_excluded_from_analytics' => false,
            'per_tooth_minutes' => null,
        ]);

        // Create 2 appointments for 9-10am with honor_preferred_dentist = false
        // To fully book Dentist A's 9-10am window, we need to book the full hour
        $patient1 = $this->createTempPatient();
        $patient2 = $this->createTempPatient();

        // Patient 1 booked with Dentist A for 9:00-10:00 (60 min, 2 blocks, honor_preferred_dentist = false)
        // This fully books Dentist A's 9-10am window
        Appointment::create([
            'patient_id' => $patient1->id,
            'service_id' => $twoBlockService->id,
            'date' => $this->bookingDate->toDateString(),
            'time_slot' => '09:00-10:00',
            'status' => 'approved',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $this->dentistA->id,
            'honor_preferred_dentist' => false,
        ]);

        // Patient 2 booked with Dentist B for 9:00-10:00 (honor_preferred_dentist = false)
        // This ensures global capacity is also full
        Appointment::create([
            'patient_id' => $patient2->id,
            'service_id' => $twoBlockService->id,
            'date' => $this->bookingDate->toDateString(),
            'time_slot' => '09:00-10:00',
            'status' => 'approved',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $this->dentistB->id,
            'honor_preferred_dentist' => false,
        ]);

        Sanctum::actingAs($this->testUser);

        // Test patient with honor_preferred_dentist ON should NOT see 9:00 or 9:30 slots
        // Using the same 2-block service for the query
        $response = $this->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d&honor_preferred_dentist=1',
            $this->bookingDate->toDateString(),
            $twoBlockService->id
        ));

        $this->assertSame(200, $response->status());
        $payload = $response->json();

        // Should not contain 9:00 or 9:30 slots because Dentist A is fully booked for 9-10am
        $this->assertNotContains('09:00', $payload['slots'], '9:00 slot should not be available when Dentist A is booked');
        $this->assertNotContains('09:30', $payload['slots'], '9:30 slot should not be available when Dentist A is fully booked');

        // Verify preferred dentist is set correctly
        $this->assertEquals($this->dentistA->id, $payload['metadata']['preferred_dentist_id']);
        $this->assertTrue($payload['metadata']['effective_honor_preferred_dentist']);
    }

    /**
     * Scenario 2: Patients fully booked 9-10am.
     * One patient booked Dentist A for 9-10am with honor_preferred_dentist ON.
     * Another patient booked 9-10am with no preferred dentist (honor_preferred_dentist = false).
     * Another patient (regardless of honor_preferred_dentist setting) should NOT see slots at 9:00 and 9:30.
     */
    public function test_scenario_2_no_slots_when_fully_booked_with_mixed_preferences(): void
    {
        // Create a service that takes 60 minutes (2 blocks)
        $twoBlockService = Service::create([
            'name' => 'Two Block Service',
            'description' => 'Service that takes 60 minutes (2 blocks)',
            'price' => 2000,
            'estimated_minutes' => 60,
            'per_teeth_service' => false,
            'is_special' => false,
            'is_excluded_from_analytics' => false,
            'per_tooth_minutes' => null,
        ]);

        $patient1 = $this->createTempPatient();
        $patient2 = $this->createTempPatient();

        // Patient 1: Booked Dentist A for 9:00-10:00 (60 min, 2 blocks) with honor_preferred_dentist = true
        // This fully books Dentist A's 9-10am window
        Appointment::create([
            'patient_id' => $patient1->id,
            'service_id' => $twoBlockService->id,
            'date' => $this->bookingDate->toDateString(),
            'time_slot' => '09:00-10:00',
            'status' => 'approved',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $this->dentistA->id,
            'honor_preferred_dentist' => true,
        ]);

        // Patient 2: Booked Dentist B for 9:00-10:00 (60 min, 2 blocks) with no preferred dentist (honor_preferred_dentist = false)
        // This ensures global capacity is also full for the 9-10am window
        Appointment::create([
            'patient_id' => $patient2->id,
            'service_id' => $twoBlockService->id,
            'date' => $this->bookingDate->toDateString(),
            'time_slot' => '09:00-10:00',
            'status' => 'approved',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $this->dentistB->id,
            'honor_preferred_dentist' => false,
        ]);

        Sanctum::actingAs($this->testUser);

        // Test with honor_preferred_dentist ON
        // Using the same 2-block service for the query
        $response = $this->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d&honor_preferred_dentist=1',
            $this->bookingDate->toDateString(),
            $twoBlockService->id
        ));

        $this->assertSame(200, $response->status());
        $payload = $response->json();

        // Should not contain 9:00 slot because Dentist A is booked at 9:00-10:00 (full hour, 2 blocks)
        // For a 60-minute service starting at 9:00, it needs blocks 9:00 and 9:30.
        // Dentist A has an appointment 9:00-10:00, which occupies both 9:00 and 9:30 blocks.
        $this->assertNotContains('09:00', $payload['slots'], '9:00 slot should not be available (Dentist A booked 9:00-10:00)');
        
        // Should not contain 9:30 slot because Dentist A is booked at 9:00-10:00
        // For a 60-minute service starting at 9:30, it needs blocks 9:30 and 10:00.
        // Dentist A has an appointment 9:00-10:00, which occupies the 9:30 block.
        // Also, 10:00 is the end of Dentist A's availability, so 9:30 slot cannot be booked.
        $this->assertNotContains('09:30', $payload['slots'], '9:30 slot should not be available (Dentist A booked 9:00-10:00)');

        // Test with honor_preferred_dentist OFF - should also not see 9:00 and 9:30
        $response2 = $this->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d&honor_preferred_dentist=0',
            $this->bookingDate->toDateString(),
            $twoBlockService->id
        ));

        $this->assertSame(200, $response2->status());
        $payload2 = $response2->json();

        // Even with honor_preferred_dentist OFF, should not see 9:00 and 9:30 because global capacity is full
        // (2 appointments in 9-10am window with 2 dentists = full capacity)
        $this->assertNotContains('09:00', $payload2['slots'], '9:00 slot should not be available (fully booked)');
        $this->assertNotContains('09:30', $payload2['slots'], '9:30 slot should not be available (fully booked)');
    }

    /**
     * Scenario 3: Patient with honor_preferred_dentist ON for Dentist A.
     * If no appointments have been made yet that day, they should be able to book
     * an appointment from 9 to 10am (9:00 and 9:30 time blocks if service can finish by 10am).
     */
    public function test_scenario_3_slots_available_when_no_appointments_exist(): void
    {
        Sanctum::actingAs($this->testUser);

        // No appointments exist yet - test patient should see available slots
        $response = $this->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d&honor_preferred_dentist=1',
            $this->bookingDate->toDateString(),
            $this->service->id
        ));

        $this->assertSame(200, $response->status());
        $payload = $response->json();

        // Should contain 9:00 and 9:30 slots because:
        // - No appointments exist
        // - Dentist A is available 9-10am
        // - Service is 30 minutes, so both 9:00 and 9:30 can finish by 10am
        $this->assertContains('09:00', $payload['slots'], '9:00 slot should be available when no appointments exist');
        $this->assertContains('09:30', $payload['slots'], '9:30 slot should be available when no appointments exist');

        // Verify preferred dentist is set correctly
        $this->assertEquals($this->dentistA->id, $payload['metadata']['preferred_dentist_id']);
        $this->assertTrue($payload['metadata']['effective_honor_preferred_dentist']);

        // Verify that 10:00 is NOT available (Dentist A ends at 10:00, so 10:00 start would be outside hours)
        $this->assertNotContains('10:00', $payload['slots'], '10:00 slot should not be available (outside Dentist A hours)');
    }

    /**
     * Additional test: Verify that 9:00 slot is available but 10:00 is not
     * when service duration is exactly 1 hour (2 blocks)
     */
    public function test_scenario_3_one_hour_service_slot_availability(): void
    {
        // Create a service that takes 1 hour (60 minutes)
        $oneHourService = Service::create([
            'name' => 'One Hour Service',
            'description' => 'Service that takes 1 hour',
            'price' => 2000,
            'estimated_minutes' => 60,
            'per_teeth_service' => false,
            'is_special' => false,
            'is_excluded_from_analytics' => false,
            'per_tooth_minutes' => null,
        ]);

        Sanctum::actingAs($this->testUser);

        $response = $this->getJson(sprintf(
            '/api/appointment/available-slots?date=%s&service_id=%d&honor_preferred_dentist=1',
            $this->bookingDate->toDateString(),
            $oneHourService->id
        ));

        $this->assertSame(200, $response->status());
        $payload = $response->json();

        // 9:00 slot should be available (9:00-10:00 fits within Dentist A's 9-10am window)
        $this->assertContains('09:00', $payload['slots'], '9:00 slot should be available for 1-hour service');

        // 9:30 slot should NOT be available (9:30-10:30 would exceed Dentist A's 10:00 end time)
        $this->assertNotContains('09:30', $payload['slots'], '9:30 slot should not be available for 1-hour service (exceeds Dentist A hours)');
    }

    protected function setUpClinicSchedule(Carbon $date): void
    {
        ClinicWeeklySchedule::create([
            'weekday' => $date->dayOfWeek,
            'is_open' => true,
            'open_time' => '09:00',
            'close_time' => '17:00',
        ]);
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

    protected function createTempPatient(): Patient
    {
        return Patient::create([
            'first_name' => 'Temp',
            'last_name' => Str::upper(Str::random(4)),
            'contact_number' => null,
            'is_linked' => false,
        ]);
    }
}

