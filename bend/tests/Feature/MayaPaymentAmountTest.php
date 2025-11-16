<?php

namespace Tests\Feature;

use Tests\TestCase;
use Illuminate\Support\Facades\Http;
use App\Models\User;
use App\Models\Patient;
use App\Models\Service;
use App\Models\Payment;
use App\Models\Appointment;
use App\Models\PatientVisit;
use App\Models\VisitAdditionalCharge;
use App\Models\ServiceDiscount;
use Illuminate\Foundation\Testing\RefreshDatabase;

class MayaPaymentAmountTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        // Ensure https base URL for redirect validation
        config()->set('app.url', 'https://example.test');
        // Provide dummy Maya keys
        config()->set('services.maya.public', 'pk_test_dummy');
        config()->set('services.maya.secret', 'sk_test_dummy');

        // Fake Maya endpoints used during payment creation
        $base = rtrim(env('MAYA_BASE', 'https://pg-sandbox.paymaya.com'), '/');
        Http::fake(function ($request) use ($base) {
            $path = $request->url();
            if (str_starts_with($path, $base . '/payby/v2/paymaya/payments') || str_starts_with($path, $base . '/payby/v2/payments')) {
                return Http::response([
                    'paymentId' => 'test-payment-id-' . uniqid(),
                    'redirectUrl' => 'https://example.test/redirect/' . uniqid(),
                ], 200);
            }
            return Http::response([], 200);
        });
    }

    private function actingClinicUser(): User
    {
        $user = User::factory()->create([
            'role' => 'patient',
            'status' => 'activated',
            'email_verified_at' => now(),
        ]);
        // Use Sanctum guard to pass auth:sanctum middleware
        $this->actingAs($user, 'sanctum');
        return $user;
    }

    private function createPatient(User $user): Patient
    {
        return Patient::factory()->create([
            'user_id' => $user->id,
        ]);
    }

    public function test_creating_maya_payment_uses_service_price_for_seeded_services(): void
    {
        $user = $this->actingClinicUser();
        $patient = $this->createPatient($user);

        // Create example services
        Service::create([
            'name' => 'X-Ray',
            'description' => 'Professional x-ray',
            'price' => 500.00,
            'estimated_minutes' => 10,
            'is_active' => true,
        ]);
        Service::create([
            'name' => 'Orthodontic Consultation',
            'description' => 'Consultation',
            'price' => 1500.00,
            'estimated_minutes' => 30,
            'is_active' => true,
        ]);

        $serviceNamesToExpected = [
            'X-Ray' => 500.00,
            'Orthodontic Consultation' => 1500.00,
        ];

        foreach ($serviceNamesToExpected as $name => $expectedPrice) {
            $service = Service::where('name', $name)->firstOrFail();

            $appointment = Appointment::create([
                'patient_id' => $patient->id,
                'service_id' => $service->id,
                'date' => now()->toDateString(),
                'time_slot' => '09:00-09:30',
                'status' => 'pending',
                'payment_method' => 'maya',
                'payment_status' => 'unpaid',
            ]);

            $resp = $this->postJson('/api/maya/payments', [
                'appointment_id' => $appointment->id,
            ]);

            $resp->assertStatus(200);

            $payment = Payment::latest('id')->first();
            $this->assertNotNull($payment);
            $this->assertSame('maya', $payment->method);
            $this->assertEquals($expectedPrice, (float) $payment->amount_due);
        }
    }

    public function test_per_tooth_service_uses_price_times_teeth_count(): void
    {
        $user = $this->actingClinicUser();
        $patient = $this->createPatient($user);

        // Create a per-tooth service: ₱100 per tooth
        $service = Service::factory()->create([
            'name' => 'Per-Tooth Test Service',
            'price' => 100.00,
            'per_teeth_service' => true,
        ]);

        $appointment = Appointment::create([
            'patient_id' => $patient->id,
            'service_id' => $service->id,
            'date' => now()->toDateString(),
            'time_slot' => '10:00-10:30',
            'status' => 'pending',
            'payment_method' => 'maya',
            'payment_status' => 'unpaid',
            'teeth_count' => 3,
        ]);

        $resp = $this->postJson('/api/maya/payments', [
            'appointment_id' => $appointment->id,
        ]);

        $resp->assertStatus(200);
        $payment = Payment::latest('id')->first();
        $this->assertNotNull($payment);
        $this->assertEquals(300.00, (float) $payment->amount_due); // 100 * 3
    }

    public function test_visit_balance_is_charged_for_patient_visit(): void
    {
        $user = $this->actingClinicUser();
        $patient = $this->createPatient($user);

        // Create service (e.g., X-Ray ₱500)
        $service = Service::create([
            'name' => 'X-Ray',
            'description' => 'Professional x-ray',
            'price' => 500.00,
            'estimated_minutes' => 10,
            'is_active' => true,
        ]);

        $visit = PatientVisit::create([
            'patient_id' => $patient->id,
            'service_id' => $service->id,
            'visit_date' => now()->toDateString(),
            'status' => 'pending',
        ]);

        // Prior partial payment: ₱100
        Payment::create([
            'patient_visit_id' => $visit->id,
            'currency' => 'PHP',
            'amount_due' => 100.00,
            'amount_paid' => 100.00,
            'method' => 'cash',
            'status' => 'paid',
            'reference_no' => 'CASH-' . time(),
            'created_by' => $user->id,
            'paid_at' => now(),
        ]);

        // Expected remaining = service(500) - paid(100) = 400
        $resp = $this->postJson('/api/maya/payments', [
            'patient_visit_id' => $visit->id,
        ]);

        $resp->assertStatus(200);
        $payment = Payment::latest('id')->first();
        $this->assertNotNull($payment);
        $this->assertEquals(400.00, (float) $payment->amount_due);
    }

    public function test_422_when_no_target_provided(): void
    {
        $this->actingClinicUser();
        $resp = $this->postJson('/api/maya/payments', []);
        $resp->assertStatus(422);
        $resp->assertJsonStructure(['message']);
    }

    public function test_appointment_on_promo_date_uses_discounted_price(): void
    {
        $user = $this->actingClinicUser();
        $patient = $this->createPatient($user);

        // Base price 1000, promo price 600 on a specific date
        $service = Service::create([
            'name' => 'Promo Service',
            'description' => 'With possible promo',
            'price' => 1000.00,
            'estimated_minutes' => 30,
            'is_active' => true,
        ]);

        $promoStart = now()->addDays(3)->toDateString();
        $promoEnd = $promoStart;
        ServiceDiscount::create([
            'service_id' => $service->id,
            'start_date' => $promoStart,
            'end_date' => $promoEnd,
            'discounted_price' => 600.00,
            'status' => 'launched',
        ]);

        $appointment = Appointment::create([
            'patient_id' => $patient->id,
            'service_id' => $service->id,
            'date' => $promoStart, // appointment on promo date
            'time_slot' => '11:00-11:30',
            'status' => 'pending',
            'payment_method' => 'maya',
            'payment_status' => 'unpaid',
        ]);

        $resp = $this->postJson('/api/maya/payments', [
            'appointment_id' => $appointment->id,
        ]);

        $resp->assertStatus(200);
        $payment = Payment::latest('id')->first();
        $this->assertNotNull($payment);
        $this->assertEquals(600.00, (float) $payment->amount_due);
    }

    public function test_appointment_on_non_promo_date_uses_base_price(): void
    {
        $user = $this->actingClinicUser();
        $patient = $this->createPatient($user);

        $service = Service::create([
            'name' => 'Promo Service Control',
            'description' => 'With possible promo',
            'price' => 1000.00,
            'estimated_minutes' => 30,
            'is_active' => true,
        ]);

        // Promo only on a future date, appointment is today
        ServiceDiscount::create([
            'service_id' => $service->id,
            'start_date' => now()->addDays(5)->toDateString(),
            'end_date' => now()->addDays(5)->toDateString(),
            'discounted_price' => 600.00,
            'status' => 'launched',
        ]);

        $appointment = Appointment::create([
            'patient_id' => $patient->id,
            'service_id' => $service->id,
            'date' => now()->toDateString(), // non-promo day
            'time_slot' => '12:00-12:30',
            'status' => 'pending',
            'payment_method' => 'maya',
            'payment_status' => 'unpaid',
        ]);

        $resp = $this->postJson('/api/maya/payments', [
            'appointment_id' => $appointment->id,
        ]);

        $resp->assertStatus(200);
        $payment = Payment::latest('id')->first();
        $this->assertNotNull($payment);
        $this->assertEquals(1000.00, (float) $payment->amount_due);
    }

    public function test_walk_in_uses_visit_date_pricing(): void
    {
        $user = $this->actingClinicUser();
        $patient = $this->createPatient($user);

        $service = Service::create([
            'name' => 'Walk-in Service',
            'description' => 'Walk-in test',
            'price' => 800.00,
            'estimated_minutes' => 30,
            'is_active' => true,
        ]);

        $visitDate = now()->addDays(7)->toDateString();
        // Promo on the visit date
        ServiceDiscount::create([
            'service_id' => $service->id,
            'start_date' => $visitDate,
            'end_date' => $visitDate,
            'discounted_price' => 500.00,
            'status' => 'launched',
        ]);

        $visit = PatientVisit::create([
            'patient_id' => $patient->id,
            'service_id' => $service->id,
            'visit_date' => $visitDate,
            'status' => 'pending',
        ]);

        $resp = $this->postJson('/api/maya/payments', [
            'patient_visit_id' => $visit->id,
        ]);

        $resp->assertStatus(200);
        $payment = Payment::latest('id')->first();
        $this->assertNotNull($payment);
        $this->assertEquals(500.00, (float) $payment->amount_due);
    }
}


