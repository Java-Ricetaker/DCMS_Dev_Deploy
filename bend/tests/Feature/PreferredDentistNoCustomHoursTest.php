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

class PreferredDentistNoCustomHoursTest extends TestCase
{
    use RefreshDatabase;

    protected Carbon $bookingDate;
    protected Service $service;
    protected DentistSchedule $dentistA; // Available all day (no custom hours)
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

        // Create Dentist A: Available all day (no specific hours set)
        $this->dentistA = $this->createDentistSchedule('DENTA', 'Dentist A', $this->bookingDate);

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
     * Test: When preferred dentist has no custom hours, all clinic hours slots should be generated
     */
    public function test_preferred_dentist_no_custom_hours_fallback_to_clinic_hours(): void
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

        $slots = $data['slots'] ?? [];
        
        // Should include all clinic hours slots (8am-5pm, excluding lunch 12:00-13:00)
        $this->assertContains('08:00', $slots, 'Should include 8:00 slot (clinic hours)');
        $this->assertContains('08:30', $slots, 'Should include 8:30 slot (clinic hours)');
        $this->assertContains('09:00', $slots, 'Should include 9:00 slot (clinic hours)');
        $this->assertContains('10:00', $slots, 'Should include 10:00 slot (clinic hours)');
        $this->assertContains('11:00', $slots, 'Should include 11:00 slot (clinic hours)');
        $this->assertContains('11:30', $slots, 'Should include 11:30 slot (clinic hours)');
        // Lunch break (12:00-13:00) should be excluded
        $this->assertNotContains('12:00', $slots, 'Should NOT include 12:00 slot (lunch break)');
        $this->assertNotContains('12:30', $slots, 'Should NOT include 12:30 slot (lunch break)');
        $this->assertContains('13:00', $slots, 'Should include 13:00 slot (after lunch)');
        $this->assertContains('14:00', $slots, 'Should include 14:00 slot (clinic hours)');
        $this->assertContains('16:00', $slots, 'Should include 16:00 slot (clinic hours)');
        $this->assertContains('16:30', $slots, 'Should include 16:30 slot (clinic hours)');

        // Verify metadata indicates preferred dentist is being honored
        $this->assertTrue($data['metadata']['effective_honor_preferred_dentist'] ?? false);
        $this->assertEquals($this->dentistA->id, $data['metadata']['preferred_dentist_id']);
    }

    /**
     * Test: Verify that booking works normally when preferred dentist has no custom hours
     */
    public function test_booking_works_with_preferred_dentist_no_custom_hours(): void
    {
        Sanctum::actingAs($this->user1);

        // Should succeed: booking at 8:00am (clinic hours)
        $response1 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '08:00',
            'payment_method' => 'cash',
            'honor_preferred_dentist' => true,
        ]);

        $response1->assertStatus(201);
        $appointment1 = Appointment::latest()->first();
        $this->assertEquals($this->dentistA->id, $appointment1->dentist_schedule_id);
        $this->assertEquals('08:00-08:30', $appointment1->time_slot);

        // Should succeed: booking at 14:00pm (clinic hours)
        $response2 = $this->postJson('/api/appointment', [
            'service_id' => $this->service->id,
            'date' => $this->bookingDate->toDateString(),
            'start_time' => '14:00',
            'payment_method' => 'cash',
            'honor_preferred_dentist' => true,
        ]);

        $response2->assertStatus(201);
        $appointment2 = Appointment::where('date', $this->bookingDate->toDateString())
            ->where('patient_id', $this->patient1->id)
            ->where('time_slot', '14:00-14:30')
            ->first();
        $this->assertNotNull($appointment2);
        $this->assertEquals($this->dentistA->id, $appointment2->dentist_schedule_id);
    }

    /**
     * Test: Verify that dentist hours are null/empty when no custom hours are set
     */
    public function test_dentist_get_hours_for_day_returns_null_when_no_custom_hours(): void
    {
        $weekday = strtolower($this->bookingDate->format('D')); // 'mon'
        $hours = $this->dentistA->getHoursForDay($weekday);
        
        $this->assertNull($hours, 'Dentist with no custom hours should return null');
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
}

