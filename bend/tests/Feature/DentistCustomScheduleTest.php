<?php

namespace Tests\Feature;

use App\Models\AppSetting;
use App\Models\Appointment;
use App\Models\ClinicWeeklySchedule;
use App\Models\DentistSchedule;
use App\Models\Patient;
use App\Models\Service;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DentistCustomScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected Carbon $bookingDate;
    protected Service $service;
    protected DentistSchedule $dentistA; // Available 9-10am only
    protected DentistSchedule $dentistB; // Available all day
    protected User $user1;
    protected User $user2;
    protected Patient $patient1;
    protected Patient $patient2;

    protected function setUp(): void
    {
        parent::setUp();

        // Set booking date to 2 days from now (Monday)
        $this->bookingDate = Carbon::now()->addDays(2)->startOfDay();
        // Ensure it's a Monday for consistent testing
        while ($this->bookingDate->dayOfWeek !== Carbon::MONDAY) {
            $this->bookingDate->addDay();
        }

        // Set up clinic schedule (open 8am-5pm)
        $this->setUpClinicSchedule($this->bookingDate);

        // Create Dentist A: Available only 9-10am on Monday
        $this->dentistA = $this->createDentistScheduleWithHours(
            'DENTA',
            'Dentist A',
            $this->bookingDate,
            '09:00',
            '10:00'
        );

        // Create Dentist B: Available all day (no specific hours)
        $this->dentistB = $this->createDentistSchedule('DENTB', 'Dentist B', $this->bookingDate);

        // Create service
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

        // Create first patient
        $this->user1 = User::create([
            'name' => 'Test Patient 1',
            'email' => 'patient1@example.test',
            'password' => Hash::make('password'),
            'role' => 'patient',
            'status' => 'activated',
            'email_verified_at' => now(),
        ]);
        $this->user1->markEmailAsVerified();

        $this->patient1 = Patient::create([
            'user_id' => $this->user1->id,
            'first_name' => 'Jane',
            'last_name' => 'Doe',
            'contact_number' => '09170000001',
            'is_linked' => true,
        ]);

        // Create second patient
        $this->user2 = User::create([
            'name' => 'Test Patient 2',
            'email' => 'patient2@example.test',
            'password' => Hash::make('password'),
            'role' => 'patient',
            'status' => 'activated',
            'email_verified_at' => now(),
        ]);
        $this->user2->markEmailAsVerified();

        $this->patient2 = Patient::create([
            'user_id' => $this->user2->id,
            'first_name' => 'John',
            'last_name' => 'Smith',
            'contact_number' => '09170000002',
            'is_linked' => true,
        ]);

        // Accept policy if required
        if ($activePolicyId = AppSetting::get('policy.active_history_id')) {
            $this->patient1->update([
                'policy_history_id' => $activePolicyId,
                'policy_accepted_at' => now(),
            ]);
            $this->patient2->update([
                'policy_history_id' => $activePolicyId,
                'policy_accepted_at' => now(),
            ]);
        }
    }

    /**
     * Test 1: Dentist A (9-10am only) - patient can book 9-10am, cannot book 10-11am
     */
    public function test_dentist_a_can_book_9_to_10am_but_not_10_to_11am(): void
    {
        Sanctum::actingAs($this->user1);

        // Should succeed: booking at 9:00am (within Dentist A's hours)
        $response1 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '09:00',
            'payment_method' => 'cash',
        ]);

        $response1->assertStatus(201);
        $appointment1 = Appointment::latest()->first();
        $this->assertEquals($this->dentistA->id, $appointment1->dentist_schedule_id);
        $this->assertEquals('09:00-09:30', $appointment1->time_slot);

        // Should fail: booking at 10:00am (outside Dentist A's hours, only Dentist B available)
        // But since Dentist B is available, it should succeed but assign Dentist B
        $response2 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '10:00',
            'payment_method' => 'cash',
        ]);

        $response2->assertStatus(201);
        $appointment2 = Appointment::where('date', $this->bookingDate->toDateString())
            ->where('patient_id', $this->patient1->id)
            ->where('time_slot', '10:00-10:30')
            ->first();
        $this->assertNotNull($appointment2);
        // Should be assigned to Dentist B since Dentist A is not available at 10am
        $this->assertEquals($this->dentistB->id, $appointment2->dentist_schedule_id);
    }

    /**
     * Test 2: Dentist B (all day) - patient can book any time during clinic hours
     */
    public function test_dentist_b_can_book_any_time_during_clinic_hours(): void
    {
        Sanctum::actingAs($this->user1);

        // Book at 8:00am
        $response1 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '08:00',
            'payment_method' => 'cash',
        ]);
        $response1->assertStatus(201);
        $appointment1 = Appointment::latest()->first();
        $this->assertEquals($this->dentistB->id, $appointment1->dentist_schedule_id);

        // Book at 2:00pm
        $response2 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '14:00',
            'payment_method' => 'cash',
        ]);
        $response2->assertStatus(201);
        $appointment2 = Appointment::where('date', $this->bookingDate->toDateString())
            ->where('patient_id', $this->patient1->id)
            ->where('time_slot', '14:00-14:30')
            ->first();
        $this->assertNotNull($appointment2);
        $this->assertEquals($this->dentistB->id, $appointment2->dentist_schedule_id);
    }

    /**
     * Test 3: 9-10am slot with both dentists - 2 different patients can book (one per dentist)
     */
    public function test_multiple_patients_can_book_9_to_10am_with_different_dentists(): void
    {
        // Patient 1 books at 9:00am
        Sanctum::actingAs($this->user1);
        $response1 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '09:00',
            'payment_method' => 'cash',
        ]);
        $response1->assertStatus(201);
        $appointment1 = Appointment::where('date', $this->bookingDate->toDateString())
            ->where('patient_id', $this->patient1->id)
            ->where('time_slot', '09:00-09:30')
            ->first();
        $this->assertNotNull($appointment1);
        $this->assertEquals($this->dentistA->id, $appointment1->dentist_schedule_id);

        // Patient 2 books at 9:00am (should get Dentist B since Dentist A is now booked)
        Sanctum::actingAs($this->user2);
        $response2 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '09:00',
            'payment_method' => 'cash',
        ]);
        $response2->assertStatus(201);
        $appointment2 = Appointment::where('date', $this->bookingDate->toDateString())
            ->where('patient_id', $this->patient2->id)
            ->where('time_slot', '09:00-09:30')
            ->first();
        $this->assertNotNull($appointment2);
        $this->assertEquals($this->dentistB->id, $appointment2->dentist_schedule_id);

        // Verify both appointments exist
        $this->assertNotEquals($appointment1->dentist_schedule_id, $appointment2->dentist_schedule_id);
    }

    /**
     * Test 4: 10-11am slot with only Dentist B - only 1 patient can book
     */
    public function test_only_one_patient_can_book_10_to_11am_with_dentist_b(): void
    {
        // Patient 1 books at 10:00am
        Sanctum::actingAs($this->user1);
        $response1 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '10:00',
            'payment_method' => 'cash',
        ]);
        $response1->assertStatus(201);
        $appointment1 = Appointment::where('date', $this->bookingDate->toDateString())
            ->where('patient_id', $this->patient1->id)
            ->where('time_slot', '10:00-10:30')
            ->first();
        $this->assertNotNull($appointment1);
        $this->assertEquals($this->dentistB->id, $appointment1->dentist_schedule_id);
        
        // Verify the appointment is in the database and will be counted
        $usage = Appointment::dentistSlotUsageForDate($this->bookingDate->toDateString());
        $this->assertArrayHasKey($this->dentistB->id, $usage, 'Dentist B should have usage');
        $this->assertArrayHasKey('10:00', $usage[$this->dentistB->id] ?? [], 'Dentist B should be booked at 10:00');
        $this->assertEquals(1, $usage[$this->dentistB->id]['10:00'] ?? 0, 'Dentist B should have 1 appointment at 10:00');

        // Patient 2 tries to book at 10:00am - should fail (Dentist B is already booked)
        Sanctum::actingAs($this->user2);
        $response2 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '10:00',
            'payment_method' => 'cash',
        ]);
        $response2->assertStatus(422);
        $response2->assertJson([
            'message' => 'Time slot starting at 10:00 is already full.',
        ]);
    }

    /**
     * Test 5: Appointment spanning multiple time blocks (e.g., 9:00-10:30) respects dentist hours
     */
    public function test_appointment_spanning_multiple_blocks_respects_dentist_hours(): void
    {
        // Create a service that takes 90 minutes (3 blocks)
        $longService = Service::create([
            'name' => 'Long Procedure',
            'description' => '90 minute procedure',
            'price' => 2000,
            'estimated_minutes' => 90,
            'per_teeth_service' => false,
            'is_special' => false,
            'is_excluded_from_analytics' => false,
            'per_tooth_minutes' => null,
        ]);

        Sanctum::actingAs($this->user1);

        // Try to book 9:00-10:30 with Dentist A - should fail because appointment extends beyond 10:00
        // The system should assign Dentist B instead since Dentist A's hours end at 10:00
        $response = $this->postJson('/api/appointment', [
            'service_id' => $longService->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '09:00',
            'payment_method' => 'cash',
        ]);

        $response->assertStatus(201);
        $appointment = Appointment::latest()->first();
        // Should be assigned to Dentist B since the appointment spans beyond Dentist A's hours
        $this->assertEquals($this->dentistB->id, $appointment->dentist_schedule_id);
        $this->assertEquals('09:00-10:30', $appointment->time_slot);
    }

    /**
     * Test 6: Preferred dentist validation with custom hours (if preferred dentist not available, fallback works)
     */
    public function test_preferred_dentist_fallback_when_not_available(): void
    {
        // Set Dentist A as preferred for patient 1
        Appointment::create([
            'patient_id' => $this->patient1->id,
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->copy()->subDay()->toDateString(),
            'time_slot' => '09:00-09:30',
            'status' => 'completed',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $this->dentistA->id,
            'honor_preferred_dentist' => true,
        ]);

        Sanctum::actingAs($this->user1);

        // Try to book at 10:00am - preferred dentist (A) not available, should fallback to Dentist B
        $response = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '10:00',
            'payment_method' => 'cash',
            'honor_preferred_dentist' => true,
        ]);

        $response->assertStatus(201);
        $appointment = Appointment::where('date', $this->bookingDate->toDateString())
            ->where('patient_id', $this->patient1->id)
            ->where('time_slot', '10:00-10:30')
            ->latest()
            ->first();
        $this->assertNotNull($appointment, 'Appointment should be created');
        // Should fallback to Dentist B since Dentist A is not available at 10am
        $this->assertEquals($this->dentistB->id, $appointment->dentist_schedule_id, 
            "Expected Dentist B (id {$this->dentistB->id}) but got Dentist (id {$appointment->dentist_schedule_id})");
    }

    /**
     * Test 7: Attempt to book outside dentist hours is rejected
     */
    public function test_booking_outside_dentist_hours_is_rejected(): void
    {
        // Create a dentist available only 11am-12pm
        $dentistC = $this->createDentistScheduleWithHours(
            'DENTC',
            'Dentist C',
            $this->bookingDate,
            '11:00',
            '12:00'
        );

        // Book Dentist A at 9am and Dentist B at 9am, so only Dentist C is available
        $this->createAppointmentForDentist($this->dentistA, '09:00-09:30');
        $this->createAppointmentForDentist($this->dentistB, '09:00-09:30');

        Sanctum::actingAs($this->user1);

        // Try to book at 9:00am - should fail because Dentist C is not available at 9am
        $response = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '09:00',
            'payment_method' => 'cash',
        ]);

        $response->assertStatus(422);
        // When Dentist A and B are booked, and Dentist C is not available at 9am,
        // the system may return either message depending on capacity vs hours check order
        // Both are valid - the important thing is the booking is rejected
        $responseData = $response->json();
        $this->assertContains($responseData['message'], [
            'No dentists are available at this time.',
            'Time slot starting at 09:00 is already full.',
        ], 'Booking should be rejected when no dentists are available');
    }

    /**
     * Test 8: Dentist A cannot be booked outside their hours even if preferred
     */
    public function test_preferred_dentist_a_cannot_be_booked_outside_hours(): void
    {
        // Set Dentist A as preferred for patient 1
        Appointment::create([
            'patient_id' => $this->patient1->id,
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->copy()->subDay()->toDateString(),
            'time_slot' => '09:00-09:30',
            'status' => 'completed',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $this->dentistA->id,
            'honor_preferred_dentist' => true,
        ]);

        Sanctum::actingAs($this->user1);

        // Try to book at 11:00am with honor_preferred_dentist=true
        // Should succeed but assign Dentist B since Dentist A is not available
        $response = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '11:00',
            'payment_method' => 'cash',
            'honor_preferred_dentist' => true,
        ]);

        $response->assertStatus(201);
        $appointment = Appointment::where('date', $this->bookingDate->toDateString())
            ->where('patient_id', $this->patient1->id)
            ->where('time_slot', '11:00-11:30')
            ->latest()
            ->first();
        $this->assertNotNull($appointment, 'Appointment should be created');
        // Should be assigned to Dentist B, not Dentist A
        $this->assertEquals($this->dentistB->id, $appointment->dentist_schedule_id,
            "Expected Dentist B (id {$this->dentistB->id}) but got Dentist (id {$appointment->dentist_schedule_id})");
        $this->assertNotEquals($this->dentistA->id, $appointment->dentist_schedule_id);
    }

    protected function setUpClinicSchedule(Carbon $date): void
    {
        ClinicWeeklySchedule::create([
            'weekday' => $date->dayOfWeek,
            'is_open' => true,
            'open_time' => '08:00',
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

    protected function createDentistScheduleWithHours(
        string $code,
        string $name,
        Carbon $date,
        string $startTime,
        string $endTime
    ): DentistSchedule {
        $days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
        $scheduleFlags = array_fill_keys($days, false);
        $dayKey = strtolower($date->format('D'));
        $scheduleFlags[$dayKey] = true;

        $data = array_merge($scheduleFlags, [
            'dentist_code' => $code,
            'dentist_name' => $name,
            'employment_type' => 'full_time',
            'status' => 'active',
            'email' => strtolower($code) . '@example.test',
            'is_pseudonymous' => false,
        ]);

        // Set start and end times for the specific day
        $startKey = "{$dayKey}_start_time";
        $endKey = "{$dayKey}_end_time";
        $data[$startKey] = $startTime;
        $data[$endKey] = $endTime;

        return DentistSchedule::create($data);
    }

    protected function createAppointmentForDentist(
        DentistSchedule $dentist,
        string $timeSlot,
        string $status = 'approved',
        ?Carbon $date = null,
        ?Patient $patient = null
    ): Appointment {
        $patient ??= Patient::create([
            'first_name' => 'Temp',
            'last_name' => Str::upper(Str::random(4)),
            'contact_number' => null,
            'is_linked' => false,
        ]);

        return Appointment::create([
            'patient_id' => $patient->id,
            'service_id' => $this->service->id,
            'date' => ($date ?? $this->bookingDate)->toDateString(),
            'time_slot' => $timeSlot,
            'status' => $status,
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $dentist->id,
            'honor_preferred_dentist' => true,
        ]);
    }
}

