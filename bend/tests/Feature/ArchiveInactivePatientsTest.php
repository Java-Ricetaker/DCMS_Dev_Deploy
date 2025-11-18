<?php

namespace Tests\Feature;

use App\Models\Patient;
use App\Models\PatientVisit;
use App\Models\Service;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class ArchiveInactivePatientsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['app.key' => 'base64:'.base64_encode(random_bytes(32))]);
    }

    public function test_command_archives_only_patients_without_recent_visits(): void
    {
        $service = Service::factory()->create();

        $inactiveUser = User::factory()->create([
            'role' => 'patient',
            'status' => 'activated',
        ]);

        $inactivePatient = Patient::factory()->create([
            'user_id' => $inactiveUser->id,
            'is_linked' => true,
            'created_at' => now()->subYears(7),
        ]);

        PatientVisit::factory()->completed()->create([
            'patient_id' => $inactivePatient->id,
            'service_id' => $service->id,
            'visit_date' => now()->subYears(6)->subDays(3)->toDateString(),
        ]);

        $activeUser = User::factory()->create([
            'role' => 'patient',
            'status' => 'activated',
        ]);

        $activePatient = Patient::factory()->create([
            'user_id' => $activeUser->id,
            'is_linked' => true,
            'created_at' => now()->subYears(2),
        ]);

        PatientVisit::factory()->completed()->create([
            'patient_id' => $activePatient->id,
            'service_id' => $service->id,
            'visit_date' => now()->subYear()->toDateString(),
        ]);

        $this->artisan('patients:archive-inactive --dry-run')
            ->assertExitCode(0);

        $this->artisan('patients:archive-inactive')
            ->assertExitCode(0);

        $this->assertNotNull($inactivePatient->fresh()->archived_at);
        $this->assertNull($activePatient->fresh()->archived_at);
    }

    public function test_admin_can_reactivate_archived_patient(): void
    {
        $admin = User::factory()->create([
            'role' => 'admin',
            'status' => 'activated',
        ]);

        $patientUser = User::factory()->create([
            'role' => 'patient',
            'status' => 'activated',
        ]);

        $patient = Patient::factory()->create([
            'user_id' => $patientUser->id,
            'is_linked' => true,
            'archived_at' => now()->subDay(),
            'archived_reason' => 'Test archive',
        ]);

        Sanctum::actingAs($admin);

        $response = $this->postJson("/api/admin/archived-patients/{$patient->id}/reactivate");

        $response->assertOk()
            ->assertJsonPath('status', 'success');

        $this->assertNull($patient->fresh()->archived_at);
        $this->assertNull($patient->fresh()->archived_reason);
    }
}

