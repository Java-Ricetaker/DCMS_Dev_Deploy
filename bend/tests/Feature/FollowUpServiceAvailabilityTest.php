<?php

namespace Tests\Feature;

use App\Models\Appointment;
use App\Models\ClinicWeeklySchedule;
use App\Models\Patient;
use App\Models\PatientVisit;
use App\Models\Service;
use App\Models\ServiceDiscount;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class FollowUpServiceAvailabilityTest extends TestCase
{
    use RefreshDatabase;

    public function test_follow_up_gap_resets_after_follow_up_completion_for_walk_in_parent(): void
    {
        $this->createOpenClinicSchedule();

        [$user, $patient] = $this->createLinkedPatientUser();

        $parentService = Service::factory()->create([
            'name' => 'Parent Service',
            'is_special' => false,
            'is_follow_up' => false,
        ]);

        $followUpService = Service::factory()->create([
            'name' => 'Follow-up Service',
            'is_special' => false,
            'is_follow_up' => true,
            'follow_up_parent_service_id' => $parentService->id,
            'follow_up_max_gap_weeks' => 6,
        ]);

        $parentVisitDate = Carbon::parse('2025-01-01');
        $initialFollowUpDate = $parentVisitDate->copy()->addWeeks(4);

        PatientVisit::factory()
            ->completed()
            ->create([
                'patient_id' => $patient->id,
                'service_id' => $parentService->id,
                'appointment_id' => null, // walk-in
                'visit_date' => $parentVisitDate->toDateString(),
            ]);

        $this->assertFollowUpVisibility(
            $user,
            $initialFollowUpDate,
            $followUpService->id,
            shouldBeVisible: true
        );

        // Complete the follow-up service, which should reset the gap timer
        PatientVisit::factory()
            ->completed()
            ->create([
                'patient_id' => $patient->id,
                'service_id' => $followUpService->id,
                'visit_date' => $initialFollowUpDate->toDateString(),
            ]);

        $secondFollowUpDate = $initialFollowUpDate->copy()->addWeeks(5);
        $this->assertFollowUpVisibility(
            $user,
            $secondFollowUpDate,
            $followUpService->id,
            shouldBeVisible: true
        );

        // Past the 6 week threshold after the latest follow-up should hide it again
        $lateFollowUpDate = $initialFollowUpDate->copy()->addWeeks(7);
        $this->assertFollowUpVisibility(
            $user,
            $lateFollowUpDate,
            $followUpService->id,
            shouldBeVisible: false
        );
    }

    public function test_follow_up_gap_resets_after_follow_up_completion_for_appointment_parent(): void
    {
        $this->createOpenClinicSchedule();

        [$user, $patient] = $this->createLinkedPatientUser();

        $parentService = Service::factory()->create([
            'name' => 'Parent Service',
            'is_special' => false,
            'is_follow_up' => false,
        ]);

        $followUpService = Service::factory()->create([
            'name' => 'Follow-up Service',
            'is_special' => false,
            'is_follow_up' => true,
            'follow_up_parent_service_id' => $parentService->id,
            'follow_up_max_gap_weeks' => 6,
        ]);

        $parentVisitDate = Carbon::parse('2025-02-01');
        $initialFollowUpDate = $parentVisitDate->copy()->addWeeks(4);

        $parentAppointment = Appointment::factory()->create([
            'patient_id' => $patient->id,
            'service_id' => $parentService->id,
            'date' => $parentVisitDate->toDateString(),
            'status' => 'completed',
        ]);

        PatientVisit::factory()
            ->completed()
            ->create([
                'patient_id' => $patient->id,
                'service_id' => $parentService->id,
                'appointment_id' => $parentAppointment->id,
                'visit_date' => $parentVisitDate->toDateString(),
            ]);

        $this->assertFollowUpVisibility(
            $user,
            $initialFollowUpDate,
            $followUpService->id,
            shouldBeVisible: true
        );

        PatientVisit::factory()
            ->completed()
            ->create([
                'patient_id' => $patient->id,
                'service_id' => $followUpService->id,
                'visit_date' => $initialFollowUpDate->toDateString(),
            ]);

        $secondFollowUpDate = $initialFollowUpDate->copy()->addWeeks(5);
        $this->assertFollowUpVisibility(
            $user,
            $secondFollowUpDate,
            $followUpService->id,
            shouldBeVisible: true
        );
    }

    public function test_patient_cannot_see_follow_up_without_history_but_staff_can_override(): void
    {
        $this->createOpenClinicSchedule();

        [$patientUser, $patient] = $this->createLinkedPatientUser();

        $parentService = Service::factory()->create([
            'name' => 'Parent Service',
            'is_special' => false,
            'is_follow_up' => false,
        ]);

        $followUpService = Service::factory()->create([
            'name' => 'Follow-up Service',
            'is_special' => false,
            'is_follow_up' => true,
            'follow_up_parent_service_id' => $parentService->id,
            'follow_up_max_gap_weeks' => 6,
        ]);

        $targetDate = Carbon::parse('2025-03-01');

        // Patient should not see the follow-up without parent/follow-up history.
        $this->assertFollowUpVisibility(
            $patientUser,
            $targetDate,
            $followUpService->id,
            shouldBeVisible: false
        );

        // Staff should still see the follow-up even when providing patient_id context.
        $staffUser = User::factory()->create([
            'role' => 'staff',
        ]);

        $response = $this->actingAs($staffUser)->getJson(
            '/api/appointment/available-services?' . http_build_query([
                'date' => $targetDate->toDateString(),
                'patient_id' => $patient->id,
            ])
        );

        $response->assertOk();
        $serviceIds = $this->extractServiceIds($response->json());
        $this->assertContains($followUpService->id, $serviceIds);
    }

    public function test_parent_discount_does_not_affect_follow_up_service_pricing(): void
    {
        $this->createOpenClinicSchedule();

        [$patientUser, $patient] = $this->createLinkedPatientUser();

        $parentService = Service::factory()->create([
            'name' => 'Parent Service',
            'price' => 1500,
            'is_special' => false,
            'is_follow_up' => false,
        ]);

        $followUpService = Service::factory()->create([
            'name' => 'Follow-up Service',
            'price' => 800,
            'is_special' => false,
            'is_follow_up' => true,
            'follow_up_parent_service_id' => $parentService->id,
            'follow_up_max_gap_weeks' => 6,
        ]);

        $targetDate = Carbon::parse('2025-04-01');

        ServiceDiscount::create([
            'service_id' => $parentService->id,
            'start_date' => $targetDate->copy()->subWeek()->toDateString(),
            'end_date' => $targetDate->copy()->addWeek()->toDateString(),
            'discounted_price' => 900,
            'status' => 'launched',
            'activated_at' => Carbon::now()->subDay(),
        ]);

        PatientVisit::factory()
            ->completed()
            ->create([
                'patient_id' => $patient->id,
                'service_id' => $parentService->id,
                'visit_date' => $targetDate->copy()->subWeeks(2)->toDateString(),
            ]);

        $patientResponse = $this->actingAs($patientUser)->getJson(
            '/api/appointment/available-services?' . http_build_query([
                'date' => $targetDate->toDateString(),
            ])
        );

        $patientServices = $this->collectServicesFromResponse($patientResponse);

        $parentEntry = $patientServices->firstWhere('id', $parentService->id);
        $this->assertNotNull($parentEntry);
        $this->assertSame('promo', $parentEntry['type']);
        $this->assertEquals(1500.0, (float) $parentEntry['original_price']);
        $this->assertEquals(900.0, (float) $parentEntry['promo_price']);
        $this->assertTrue($parentEntry['has_follow_up_services']);
        $this->assertNotEmpty($parentEntry['follow_up_services']);
        $this->assertEquals($followUpService->id, $parentEntry['follow_up_services'][0]['id']);

        $followUpEntry = $patientServices->firstWhere('id', $followUpService->id);
        $this->assertNotNull($followUpEntry);
        $this->assertSame('regular', $followUpEntry['type']);
        $this->assertEquals(800.0, (float) $followUpEntry['price']);
        $this->assertArrayNotHasKey('promo_price', $followUpEntry);
        $this->assertFalse($followUpEntry['has_follow_up_services']);
        $this->assertEmpty($followUpEntry['follow_up_services']);

        $staffUser = User::factory()->create([
            'role' => 'staff',
        ]);

        $staffResponse = $this->actingAs($staffUser)->getJson(
            '/api/appointment/available-services?' . http_build_query([
                'date' => $targetDate->toDateString(),
                'patient_id' => $patient->id,
            ])
        );

        $staffServices = $this->collectServicesFromResponse($staffResponse);

        $parentEntryStaff = $staffServices->firstWhere('id', $parentService->id);
        $this->assertNotNull($parentEntryStaff);
        $this->assertSame('promo', $parentEntryStaff['type']);
        $this->assertEquals(900.0, (float) $parentEntryStaff['promo_price']);
        $this->assertTrue($parentEntryStaff['has_follow_up_services']);
        $this->assertEquals($followUpService->id, $parentEntryStaff['follow_up_services'][0]['id']);

        $followUpEntryStaff = $staffServices->firstWhere('id', $followUpService->id);
        $this->assertNotNull($followUpEntryStaff);
        $this->assertSame('regular', $followUpEntryStaff['type']);
        $this->assertEquals(800.0, (float) $followUpEntryStaff['price']);
        $this->assertArrayNotHasKey('promo_price', $followUpEntryStaff);
        $this->assertFalse($followUpEntryStaff['has_follow_up_services']);
        $this->assertEmpty($followUpEntryStaff['follow_up_services']);
    }

    public function test_follow_up_discount_does_not_affect_parent_service_pricing(): void
    {
        $this->createOpenClinicSchedule();

        [$patientUser, $patient] = $this->createLinkedPatientUser();

        $parentService = Service::factory()->create([
            'name' => 'Parent Service',
            'price' => 1500,
            'is_special' => false,
            'is_follow_up' => false,
        ]);

        $followUpService = Service::factory()->create([
            'name' => 'Follow-up Service',
            'price' => 900,
            'is_special' => false,
            'is_follow_up' => true,
            'follow_up_parent_service_id' => $parentService->id,
            'follow_up_max_gap_weeks' => 6,
        ]);

        $targetDate = Carbon::parse('2025-05-15');

        ServiceDiscount::create([
            'service_id' => $followUpService->id,
            'start_date' => $targetDate->copy()->subWeek()->toDateString(),
            'end_date' => $targetDate->copy()->addWeek()->toDateString(),
            'discounted_price' => 450,
            'status' => 'launched',
            'activated_at' => Carbon::now()->subDay(),
        ]);

        PatientVisit::factory()
            ->completed()
            ->create([
                'patient_id' => $patient->id,
                'service_id' => $parentService->id,
                'visit_date' => $targetDate->copy()->subWeeks(2)->toDateString(),
            ]);

        $patientResponse = $this->actingAs($patientUser)->getJson(
            '/api/appointment/available-services?' . http_build_query([
                'date' => $targetDate->toDateString(),
            ])
        );

        $patientServices = $this->collectServicesFromResponse($patientResponse);

        $parentEntry = $patientServices->firstWhere('id', $parentService->id);
        $this->assertNotNull($parentEntry);
        $this->assertSame('regular', $parentEntry['type']);
        $this->assertEquals(1500.0, (float) $parentEntry['price']);
        $this->assertArrayNotHasKey('promo_price', $parentEntry);
        $this->assertTrue($parentEntry['has_follow_up_services']);
        $this->assertEquals($followUpService->id, $parentEntry['follow_up_services'][0]['id']);

        $followUpEntry = $patientServices->firstWhere('id', $followUpService->id);
        $this->assertNotNull($followUpEntry);
        $this->assertSame('promo', $followUpEntry['type']);
        $this->assertEquals(900.0, (float) $followUpEntry['original_price']);
        $this->assertEquals(450.0, (float) $followUpEntry['promo_price']);
        $this->assertFalse($followUpEntry['has_follow_up_services']);
        $this->assertEmpty($followUpEntry['follow_up_services']);

        $staffUser = User::factory()->create([
            'role' => 'staff',
        ]);

        $staffResponse = $this->actingAs($staffUser)->getJson(
            '/api/appointment/available-services?' . http_build_query([
                'date' => $targetDate->toDateString(),
                'patient_id' => $patient->id,
            ])
        );

        $staffServices = $this->collectServicesFromResponse($staffResponse);

        $parentEntryStaff = $staffServices->firstWhere('id', $parentService->id);
        $this->assertNotNull($parentEntryStaff);
        $this->assertSame('regular', $parentEntryStaff['type']);
        $this->assertEquals(1500.0, (float) $parentEntryStaff['price']);
        $this->assertTrue($parentEntryStaff['has_follow_up_services']);
        $this->assertEquals($followUpService->id, $parentEntryStaff['follow_up_services'][0]['id']);

        $followUpEntryStaff = $staffServices->firstWhere('id', $followUpService->id);
        $this->assertNotNull($followUpEntryStaff);
        $this->assertSame('promo', $followUpEntryStaff['type']);
        $this->assertEquals(450.0, (float) $followUpEntryStaff['promo_price']);
        $this->assertFalse($followUpEntryStaff['has_follow_up_services']);
        $this->assertEmpty($followUpEntryStaff['follow_up_services']);
    }

    private function assertFollowUpVisibility(User $user, Carbon $targetDate, int $followUpServiceId, bool $shouldBeVisible): void
    {
        $response = $this->actingAs($user)->getJson(
            '/api/appointment/available-services?' . http_build_query([
                'date' => $targetDate->toDateString(),
            ])
        );

        $response->assertOk();
        $serviceIds = $this->extractServiceIds($response->json());

        if ($shouldBeVisible) {
            $this->assertContains($followUpServiceId, $serviceIds);
        } else {
            $this->assertNotContains($followUpServiceId, $serviceIds);
        }
    }

    /**
     * @param array<int, mixed>|array<string, mixed> $payload
     * @return array<int, int>
     */
    private function extractServiceIds(array $payload): array
    {
        if (array_key_exists('services', $payload) && is_array($payload['services'])) {
            return collect($payload['services'])->pluck('id')->all();
        }

        return collect($payload)->pluck('id')->all();
    }

    /**
     * @param \Illuminate\Testing\TestResponse $response
     * @return \Illuminate\Support\Collection<int, array<string, mixed>>
     */
    private function collectServicesFromResponse($response)
    {
        $payload = $response->json();
        $services = $payload['services'] ?? $payload;

        return collect($services);
    }

    /**
     * @return array{0: User, 1: Patient}
     */
    private function createLinkedPatientUser(): array
    {
        $user = User::factory()->create([
            'role' => 'patient',
        ]);

        $patient = Patient::factory()->create([
            'user_id' => $user->id,
            'is_linked' => true,
        ]);

        return [$user, $patient];
    }

    private function createOpenClinicSchedule(): void
    {
        foreach (range(0, 6) as $weekday) {
            ClinicWeeklySchedule::create([
                'weekday' => $weekday,
                'is_open' => true,
                'open_time' => '08:00:00',
                'close_time' => '17:00:00',
            ]);
        }
    }
}

