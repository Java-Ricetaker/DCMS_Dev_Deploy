<?php

namespace Tests\Feature\Admin;

use App\Models\DentistSchedule;
use App\Models\Patient;
use App\Models\PatientVisit;
use App\Models\Service;
use App\Models\User;
use App\Models\VisitNote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PatientRecordControllerTest extends TestCase
{
    use RefreshDatabase;

    private function actingAsAdmin(): User
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'status' => 'activated',
        ]);

        $this->actingAs($admin, 'sanctum');

        return $admin;
    }

    public function test_admin_can_search_patients(): void
    {
        $this->actingAsAdmin();

        $anna = Patient::factory()->create([
            'first_name' => 'Anna',
            'last_name' => 'Rivera',
            'contact_number' => '09171234567',
        ]);
        Patient::factory()->create([
            'first_name' => 'Lucio',
            'last_name' => 'Garcia',
        ]);

        $response = $this->getJson('/api/admin/patient-records/search?query=Anna');

        $response->assertOk()
            ->assertJsonFragment([
                'id' => $anna->id,
                'full_name' => 'Anna Rivera',
            ]);
    }

    public function test_admin_can_filter_patient_visits(): void
    {
        $this->actingAsAdmin();

        $patient = Patient::factory()->create();
        $service = Service::factory()->create();
        $dentist = DentistSchedule::factory()->create();

        PatientVisit::factory()->create([
            'patient_id' => $patient->id,
            'service_id' => $service->id,
            'dentist_schedule_id' => $dentist->id,
            'status' => 'completed',
            'visit_date' => now()->subDay(),
        ]);

        PatientVisit::factory()->create([
            'patient_id' => $patient->id,
            'service_id' => $service->id,
            'dentist_schedule_id' => $dentist->id,
            'status' => 'pending',
            'visit_date' => now(),
        ]);

        $response = $this->getJson("/api/admin/patient-records/{$patient->id}/visits?status=completed");

        $response->assertOk();
        $this->assertCount(1, $response->json('data'));
        $this->assertEquals('completed', $response->json('data.0.status'));
    }

    public function test_admin_can_view_visit_detail_with_notes(): void
    {
        $admin = $this->actingAsAdmin();

        $patient = Patient::factory()->create();
        $service = Service::factory()->create();
        $dentist = DentistSchedule::factory()->create();

        $visit = PatientVisit::factory()->create([
            'patient_id' => $patient->id,
            'service_id' => $service->id,
            'dentist_schedule_id' => $dentist->id,
            'status' => 'completed',
            'visit_date' => now(),
        ]);

        VisitNote::create([
            'patient_visit_id' => $visit->id,
            'dentist_notes_encrypted' => 'Patient responded well to treatment.',
            'findings_encrypted' => 'Initial findings recorded.',
            'treatment_plan_encrypted' => 'Follow-up in two weeks.',
            'teeth_treated' => '11,12',
            'created_by' => $admin->id,
            'updated_by' => $admin->id,
        ]);

        $response = $this->getJson("/api/admin/patient-records/visits/{$visit->id}");

        $response->assertOk()
            ->assertJsonPath('data.visit.patient_id', $patient->id)
            ->assertJsonPath('data.visit.dentist.name', $dentist->dentist_name)
            ->assertJsonPath('data.notes.dentist_notes', 'Patient responded well to treatment.');
    }
}

