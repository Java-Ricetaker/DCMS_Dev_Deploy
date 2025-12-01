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

class PreferredDentistMultipleScenariosTest extends TestCase
{
    use RefreshDatabase;

    protected Service $service;

    protected function setUp(): void
    {
        parent::setUp();

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
    }

    /**
     * Test: Preferred dentist not available on requested day
     * Should return empty slots or fallback behavior
     */
    public function test_preferred_dentist_not_available_on_requested_day(): void
    {
        // Set booking date to Monday
        $bookingDate = Carbon::now()->addDays(2)->startOfDay();
        while ($bookingDate->dayOfWeek !== Carbon::MONDAY) {
            $bookingDate->addDay();
        }

        $this->setUpClinicSchedule($bookingDate);

        // Create Dentist A: Available only on Tuesday (not Monday)
        $dentistA = $this->createDentistScheduleWithHours(
            'DENTA',
            'Dentist A',
            $bookingDate->copy()->addDay(), // Tuesday
            '09:00',
            '17:00'
        );

        // Create patient with Dentist A as preferred
        $user = $this->createPatientUser('patient1@example.test');
        $patient = $this->createPatient($user, 'Jane', 'Doe');

        // Set Dentist A as preferred via previous appointment (on Tuesday)
        Appointment::create([
            'patient_id' => $patient->id,
            'service_id' => $this->service->id,
            'date' => $bookingDate->copy()->addDay()->toDateString(), // Tuesday
            'time_slot' => '09:00-09:30',
            'status' => 'completed',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $dentistA->id,
            'honor_preferred_dentist' => true,
        ]);

        Sanctum::actingAs($user);

        // Request slots for Monday (dentist not available)
        $response = $this->getJson('/api/appointment/available-slots?' . http_build_query([
            'date' => $bookingDate->toDateString(),
            'service_id' => $this->service->id,
            'honor_preferred_dentist' => true,
        ]));

        $response->assertStatus(200);
        $data = $response->json();

        // Preferred dentist is not active on Monday, so should fallback to clinic hours
        $this->assertFalse($data['metadata']['preferred_dentist_active'] ?? true);
        $this->assertFalse($data['metadata']['effective_honor_preferred_dentist'] ?? true);
        
        // Should still have slots (clinic hours)
        $slots = $data['slots'] ?? [];
        $this->assertNotEmpty($slots, 'Should have clinic hours slots when preferred dentist not available');
    }

    /**
     * Test: Preferred dentist with custom hours spanning lunch break
     * Should exclude lunch break from generated slots
     */
    public function test_preferred_dentist_custom_hours_spanning_lunch_break(): void
    {
        // Set booking date to Monday
        $bookingDate = Carbon::now()->addDays(2)->startOfDay();
        while ($bookingDate->dayOfWeek !== Carbon::MONDAY) {
            $bookingDate->addDay();
        }

        $this->setUpClinicSchedule($bookingDate);

        // Create Dentist A: Available 11:00am-2:00pm (spans lunch break)
        $dentistA = $this->createDentistScheduleWithHours(
            'DENTA',
            'Dentist A',
            $bookingDate,
            '11:00',
            '14:00'
        );

        // Create patient with Dentist A as preferred
        $user = $this->createPatientUser('patient2@example.test');
        $patient = $this->createPatient($user, 'John', 'Smith');

        Appointment::create([
            'patient_id' => $patient->id,
            'service_id' => $this->service->id,
            'date' => $bookingDate->copy()->subWeek()->toDateString(),
            'time_slot' => '11:00-11:30',
            'status' => 'completed',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $dentistA->id,
            'honor_preferred_dentist' => true,
        ]);

        Sanctum::actingAs($user);

        $response = $this->getJson('/api/appointment/available-slots?' . http_build_query([
            'date' => $bookingDate->toDateString(),
            'service_id' => $this->service->id,
            'honor_preferred_dentist' => true,
        ]));

        $response->assertStatus(200);
        $data = $response->json();
        $slots = $data['slots'] ?? [];

        // Should include slots within dentist hours (11:00-14:00)
        $this->assertContains('11:00', $slots, 'Should include 11:00 slot');
        $this->assertContains('11:30', $slots, 'Should include 11:30 slot');
        
        // Lunch break (12:00-13:00) should be excluded by buildBlocks
        $this->assertNotContains('12:00', $slots, 'Should NOT include 12:00 slot (lunch break)');
        $this->assertNotContains('12:30', $slots, 'Should NOT include 12:30 slot (lunch break)');
        
        // After lunch, should include slots up to 14:00 (exclusive)
        $this->assertContains('13:00', $slots, 'Should include 13:00 slot (after lunch)');
        $this->assertContains('13:30', $slots, 'Should include 13:30 slot');
        
        // Should not include slots outside dentist hours
        $this->assertNotContains('10:00', $slots, 'Should NOT include 10:00 slot (before dentist hours)');
        $this->assertNotContains('14:00', $slots, 'Should NOT include 14:00 slot (at dentist end time, exclusive)');
    }

    /**
     * Test: Multiple patients with different preferred dentists
     * Each should see slots based on their preferred dentist's schedule
     */
    public function test_multiple_patients_different_preferred_dentists(): void
    {
        // Set booking date to Monday
        $bookingDate = Carbon::now()->addDays(2)->startOfDay();
        while ($bookingDate->dayOfWeek !== Carbon::MONDAY) {
            $bookingDate->addDay();
        }

        $this->setUpClinicSchedule($bookingDate);

        // Create Dentist A: Available 9-10am
        $dentistA = $this->createDentistScheduleWithHours(
            'DENTA',
            'Dentist A',
            $bookingDate,
            '09:00',
            '10:00'
        );

        // Create Dentist B: Available 2-3pm
        $dentistB = $this->createDentistScheduleWithHours(
            'DENTB',
            'Dentist B',
            $bookingDate,
            '14:00',
            '15:00'
        );

        // Create Patient 1 with Dentist A as preferred
        $user1 = $this->createPatientUser('patient1@example.test');
        $patient1 = $this->createPatient($user1, 'Jane', 'Doe');
        Appointment::create([
            'patient_id' => $patient1->id,
            'service_id' => $this->service->id,
            'date' => $bookingDate->copy()->subWeek()->toDateString(),
            'time_slot' => '09:00-09:30',
            'status' => 'completed',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $dentistA->id,
            'honor_preferred_dentist' => true,
        ]);

        // Create Patient 2 with Dentist B as preferred
        $user2 = $this->createPatientUser('patient2@example.test');
        $patient2 = $this->createPatient($user2, 'John', 'Smith');
        Appointment::create([
            'patient_id' => $patient2->id,
            'service_id' => $this->service->id,
            'date' => $bookingDate->copy()->subWeek()->toDateString(),
            'time_slot' => '14:00-14:30',
            'status' => 'completed',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $dentistB->id,
            'honor_preferred_dentist' => true,
        ]);

        // Patient 1 should see only 9-10am slots
        Sanctum::actingAs($user1);
        $response1 = $this->getJson('/api/appointment-slots?' . http_build_query([
            'date' => $bookingDate->toDateString(),
            'service_id' => $this->service->id,
            'honor_preferred_dentist' => true,
        ]));
        $response1->assertStatus(200);
        $data1 = $response1->json();
        $slots1 = $data1['slots'] ?? [];
        $this->assertContains('09:00', $slots1);
        $this->assertContains('09:30', $slots1);
        $this->assertNotContains('14:00', $slots1, 'Patient 1 should NOT see Dentist B hours');

        // Patient 2 should see only 2-3pm slots
        Sanctum::actingAs($user2);
        $response2 = $this->getJson('/api/appointment-slots?' . http_build_query([
            'date' => $bookingDate->toDateString(),
            'service_id' => $this->service->id,
            'honor_preferred_dentist' => true,
        ]));
        $response2->assertStatus(200);
        $data2 = $response2->json();
        $slots2 = $data2['slots'] ?? [];
        $this->assertContains('14:00', $slots2);
        $this->assertContains('14:30', $slots2);
        $this->assertNotContains('09:00', $slots2, 'Patient 2 should NOT see Dentist A hours');
    }

    /**
     * Test: Preferred dentist with custom hours on different days
     * Monday: 9-10am, Tuesday: 2-3pm
     */
    public function test_preferred_dentist_different_hours_different_days(): void
    {
        // Set booking date to Monday
        $monday = Carbon::now()->addDays(2)->startOfDay();
        while ($monday->dayOfWeek !== Carbon::MONDAY) {
            $monday->addDay();
        }
        $tuesday = $monday->copy()->addDay();

        $this->setUpClinicSchedule($monday);
        $this->setUpClinicSchedule($tuesday);

        // Create Dentist A: Monday 9-10am, Tuesday 2-3pm
        $dentistA = DentistSchedule::create([
            'dentist_code' => 'DENTA',
            'dentist_name' => 'Dentist A',
            'employment_type' => 'full_time',
            'status' => 'active',
            'email' => 'denta@example.test',
            'is_pseudonymous' => false,
            'mon' => true,
            'tue' => true,
            'wed' => false,
            'thu' => false,
            'fri' => false,
            'sat' => false,
            'sun' => false,
            'mon_start_time' => '09:00',
            'mon_end_time' => '10:00',
            'tue_start_time' => '14:00',
            'tue_end_time' => '15:00',
        ]);

        // Create patient with Dentist A as preferred
        $user = $this->createPatientUser('patient3@example.test');
        $patient = $this->createPatient($user, 'Alice', 'Johnson');

        Appointment::create([
            'patient_id' => $patient->id,
            'service_id' => $this->service->id,
            'date' => $monday->copy()->subWeek()->toDateString(),
            'time_slot' => '09:00-09:30',
            'status' => 'completed',
            'payment_method' => 'cash',
            'payment_status' => 'paid',
            'reference_code' => Str::upper(Str::random(8)),
            'dentist_schedule_id' => $dentistA->id,
            'honor_preferred_dentist' => true,
        ]);

        Sanctum::actingAs($user);

        // Monday: Should see only 9-10am slots
        $response1 = $this->getJson('/api/appointment-slots?' . http_build_query([
            'date' => $monday->toDateString(),
            'service_id' => $this->service->id,
            'honor_preferred_dentist' => true,
        ]));
        $response1->assertStatus(200);
        $data1 = $response1->json();
        $slots1 = $data1['slots'] ?? [];
        $this->assertContains('09:00', $slots1, 'Monday should have 9:00 slot');
        $this->assertContains('09:30', $slots1, 'Monday should have 9:30 slot');
        $this->assertNotContains('14:00', $slots1, 'Monday should NOT have 14:00 slot');

        // Tuesday: Should see only 2-3pm slots
        $response2 = $this->getJson('/api/appointment-slots?' . http_build_query([
            'date' => $tuesday->toDateString(),
            'service_id' => $this->service->id,
            'honor_preferred_dentist' => true,
        ]));
        $response2->assertStatus(200);
        $data2 = $response2->json();
        $slots2 = $data2['slots'] ?? [];
        $this->assertContains('14:00', $slots2, 'Tuesday should have 14:00 slot');
        $this->assertContains('14:30', $slots2, 'Tuesday should have 14:30 slot');
        $this->assertNotContains('09:00', $slots2, 'Tuesday should NOT have 9:00 slot');
    }

    protected function setUpClinicSchedule(Carbon $date): void
    {
        // Check if schedule already exists for this weekday
        $existing = ClinicWeeklySchedule::where('weekday', $date->dayOfWeek)->first();
        if (!$existing) {
            ClinicWeeklySchedule::create([
                'weekday' => $date->dayOfWeek,
                'is_open' => true,
                'open_time' => '08:00',
                'close_time' => '17:00',
            ]);
        }
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

    protected function createPatientUser(string $email): User
    {
        $user = User::create([
            'name' => 'Test Patient',
            'email' => $email,
            'password' => Hash::make('password'),
            'role' => 'patient',
            'status' => 'activated',
            'email_verified_at' => now(),
        ]);
        $user->markEmailAsVerified();
        return $user;
    }

    protected function createPatient(User $user, string $firstName, string $lastName): Patient
    {
        $patient = Patient::create([
            'user_id' => $user->id,
            'first_name' => $firstName,
            'last_name' => $lastName,
            'contact_number' => '09170000001',
            'is_linked' => true,
        ]);

        // Accept policy if required
        if ($activePolicyId = AppSetting::get('policy.active_history_id')) {
            $patient->update([
                'policy_history_id' => $activePolicyId,
                'policy_accepted_at' => now(),
            ]);
        }

        return $patient;
    }
}

