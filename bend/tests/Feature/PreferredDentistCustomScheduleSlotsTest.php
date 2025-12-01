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

class PreferredDentistCustomScheduleSlotsTest extends TestCase
{
    use RefreshDatabase;

    protected Carbon $bookingDate;
    protected Service $service;
    protected DentistSchedule $dentistA; // Available 9-10am only on Monday
    protected DentistSchedule $dentistB; // Available all day
    protected User $user1;
    protected Patient $patient1;

    protected function setUp(): void
    {
        parent::setUp();

        // Set booking date to next Monday
        $this->bookingDate = Carbon::now()->addDays(2)->startOfDay();
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

        // Create patient
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

        // Accept policy if required
        if ($activePolicyId = AppSetting::get('policy.active_history_id')) {
            $this->patient1->update([
                'policy_history_id' => $activePolicyId,
                'policy_accepted_at' => now(),
            ]);
        }

        // Set Dentist A as preferred dentist for patient (via previous appointment)
        Appointment::create([
            'patient_id' => $this->patient1->id,
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->copy()->subWeek()->toDateString(),
            'time_slot' => '09:00-09:30',
            'status' => 'completed',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $this->dentistA->id,
            'honor_preferred_dentist' => true,
        ]);
    }

    /**
     * Test: When patient has preferred dentist flag on and previous dentist is Dentist A
     * with Monday schedule 9-10am only, only 9:00 and 9:30 slots should be generated
     */
    public function test_preferred_dentist_custom_schedule_generates_only_9_to_10am_slots(): void
    {
        Sanctum::actingAs($this->user1);

        // Request slots with honor_preferred_dentist=true
        $response = $this->getJson('/api/appointment/available-slots?' . http_build_query([
            'date' => $this->bookingDate->toDateString(),
            'service_id' => $this->service->id,
            'honor_preferred_dentist' => true,
        ]));

        $response->assertStatus(200);
        $data = $response->json();

        // Should only have slots within 9-10am range
        $slots = $data['slots'] ?? [];
        
        // Verify slots are only 9:00 and 9:30 (within 9-10am)
        $this->assertContains('09:00', $slots, 'Should include 9:00 slot');
        $this->assertContains('09:30', $slots, 'Should include 9:30 slot');
        
        // Verify slots outside 9-10am are NOT included
        $this->assertNotContains('08:00', $slots, 'Should NOT include 8:00 slot (before dentist hours)');
        $this->assertNotContains('08:30', $slots, 'Should NOT include 8:30 slot (before dentist hours)');
        $this->assertNotContains('10:00', $slots, 'Should NOT include 10:00 slot (at dentist end time, exclusive)');
        $this->assertNotContains('10:30', $slots, 'Should NOT include 10:30 slot (after dentist hours)');
        $this->assertNotContains('11:00', $slots, 'Should NOT include 11:00 slot (after dentist hours)');
        $this->assertNotContains('14:00', $slots, 'Should NOT include 14:00 slot (after dentist hours)');

        // Verify metadata indicates preferred dentist is being honored
        $this->assertTrue($data['metadata']['effective_honor_preferred_dentist'] ?? false);
        $this->assertEquals($this->dentistA->id, $data['metadata']['preferred_dentist_id']);
    }

    /**
     * Test: When honor_preferred_dentist is false, all clinic hours slots should be available
     */
    public function test_without_preferred_dentist_flag_all_clinic_slots_available(): void
    {
        Sanctum::actingAs($this->user1);

        // Request slots with honor_preferred_dentist=false
        $response = $this->getJson('/api/appointment-slots?' . http_build_query([
            'date' => $this->bookingDate->toDateString(),
            'service_id' => $this->service->id,
            'honor_preferred_dentist' => false,
        ]));

        $response->assertStatus(200);
        $data = $response->json();

        $slots = $data['slots'] ?? [];
        
        // Should include slots from clinic hours (8am-5pm, excluding lunch)
        $this->assertContains('08:00', $slots, 'Should include 8:00 slot (clinic hours)');
        $this->assertContains('09:00', $slots, 'Should include 9:00 slot (clinic hours)');
        $this->assertContains('10:00', $slots, 'Should include 10:00 slot (clinic hours)');
        $this->assertContains('14:00', $slots, 'Should include 14:00 slot (clinic hours)');

        // Verify metadata indicates preferred dentist is NOT being honored
        $this->assertFalse($data['metadata']['effective_honor_preferred_dentist'] ?? true);
    }

    /**
     * Test: Verify that only slots within preferred dentist hours are bookable
     */
    public function test_booking_only_allowed_within_preferred_dentist_hours(): void
    {
        Sanctum::actingAs($this->user1);

        // Should succeed: booking at 9:00am (within Dentist A's hours)
        $response1 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '09:00',
            'payment_method' => 'cash',
            'honor_preferred_dentist' => true,
        ]);

        $response1->assertStatus(201);
        $appointment1 = Appointment::latest()->first();
        $this->assertEquals($this->dentistA->id, $appointment1->dentist_schedule_id);
        $this->assertEquals('09:00-09:30', $appointment1->time_slot);

        // Should fail: booking at 10:00am (outside Dentist A's hours, exclusive of end time)
        // Since slots are now restricted to 9-10am, 10:00 won't be in the available slots
        // The frontend shouldn't show it, but if someone tries to book it directly,
        // it will fail because it's not in the grid or no dentists are available
        $response2 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '10:00',
            'payment_method' => 'cash',
            'honor_preferred_dentist' => true,
        ]);

        $response2->assertStatus(422);
        // The error could be either "Invalid start time" or "No dentists are available"
        // depending on how the validation flows
        $responseData = $response2->json();
        $this->assertContains($responseData['message'], [
            'Invalid start time (not on grid or outside hours).',
            'No dentists are available at this time.',
        ], 'Booking at 10:00 should fail when preferred dentist hours are 9-10am');
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
}

