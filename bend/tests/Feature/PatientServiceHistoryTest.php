<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\PatientVisit;
use App\Models\Service;
use App\Models\User;
use App\Models\VisitNote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PatientServiceHistoryTest extends TestCase
{
    use RefreshDatabase;

    public function test_visit_history_includes_dentist_notes_and_plan()
    {
        $user = User::factory()->create([
            'role' => 'patient',
        ]);

        $patient = Patient::factory()->create([
            'user_id' => $user->id,
        ]);

        $service = Service::factory()->create([
            'name' => 'Comprehensive Cleaning',
        ]);

        $visit = PatientVisit::factory()
            ->completed()
            ->create([
                'patient_id' => $patient->id,
                'service_id' => $service->id,
                'visit_date' => now()->toDateString(),
            ]);

        VisitNote::create([
            'patient_visit_id' => $visit->id,
            'dentist_notes_encrypted' => 'Patient has improved gum health.',
            'findings_encrypted' => 'Mild gingivitis observed in lower molars.',
            'treatment_plan_encrypted' => 'Recommend follow-up cleaning in 3 months.',
        ]);

        $response = $this
            ->actingAs($user)
            ->getJson('/api/user-visit-history');

        $response
            ->assertOk()
            ->assertJsonPath('data.0.dentist_notes', 'Patient has improved gum health.')
            ->assertJsonPath('data.0.findings', 'Mild gingivitis observed in lower molars.')
            ->assertJsonPath('data.0.treatment_plan', 'Recommend follow-up cleaning in 3 months.')
            ->assertJsonPath('data.0.dentist_name', $visit->assignedDentist->dentist_name);
    }

    public function test_visit_history_falls_back_to_visit_note_creator_when_no_assigned_dentist()
    {
        $user = User::factory()->create([
            'role' => 'patient',
        ]);

        $patient = Patient::factory()->create([
            'user_id' => $user->id,
        ]);

        $service = Service::factory()->create([
            'name' => 'Filling',
        ]);

        $staffUser = User::factory()->create([
            'name' => 'Dr. Fallback',
            'role' => 'staff',
        ]);

        $visit = PatientVisit::factory()
            ->completed()
            ->create([
                'patient_id' => $patient->id,
                'service_id' => $service->id,
                'dentist_schedule_id' => null,
                'visit_date' => now()->toDateString(),
            ]);

        VisitNote::create([
            'patient_visit_id' => $visit->id,
            'dentist_notes_encrypted' => 'All good.',
            'findings_encrypted' => 'None.',
            'treatment_plan_encrypted' => 'Routine check.',
            'created_by' => $staffUser->id,
        ]);

        $response = $this
            ->actingAs($user)
            ->getJson('/api/user-visit-history');

        $response
            ->assertOk()
            ->assertJsonFragment([
                'id' => $visit->id,
                'dentist_name' => 'Dr. Fallback',
            ]);
    }
}

