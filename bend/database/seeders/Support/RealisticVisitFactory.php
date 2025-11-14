<?php

namespace Database\Seeders\Support;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\PatientMedicalHistory;
use App\Models\PatientVisit;
use App\Models\Payment;
use App\Models\Service;
use App\Models\User;
use App\Models\VisitNote;
use Carbon\Carbon;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

class RealisticVisitFactory
{
    private \Faker\Generator $faker;

    public function __construct(private readonly User $adminUser)
    {
        $this->faker = \Faker\Factory::create();
    }

    /**
     * Create a visit that mimics the live operational flow.
     *
     * @param  Carbon  $day                 The day the visit occurs.
     * @param  EloquentCollection<Patient>  $patients
     * @param  EloquentCollection<Service>  $services
     * @param  EloquentCollection           $activeDentists
     * @param  array<string, int>           $slotUsage
     * @param  string[]                     $grid
     * @param  int                          $capacity
     * @return array{visit: ?PatientVisit, appointment: ?Appointment, payment: ?Payment}
     */
    public function createVisitForDay(
        Carbon $day,
        EloquentCollection $patients,
        EloquentCollection $services,
        EloquentCollection $activeDentists,
        array &$slotUsage,
        array $grid,
        int $capacity
    ): array {
        if ($patients->isEmpty() || $services->isEmpty() || empty($grid) || $capacity <= 0) {
            return ['visit' => null, 'appointment' => null, 'payment' => null];
        }

        /** @var Service $service */
        $service = $services->random();
        /** @var Patient $patient */
        $patient = $patients->random();

        $status = $this->getVisitStatus($day);
        $duration = $this->determineDuration($service, $status);

        $timeSlot = $this->generateTimeSlotWithCapacity($day, $slotUsage, $capacity, $grid, $duration);
        if (!$timeSlot) {
            return ['visit' => null, 'appointment' => null, 'payment' => null];
        }

        $startTime = $timeSlot['start'];
        $endTime = $timeSlot['end'];
        $timeSlotLabel = $timeSlot['slot'];

        $dentistScheduleId = $status === 'completed' && $activeDentists->isNotEmpty()
            ? $activeDentists->random()->id
            : null;

        $paymentMethod = $this->getPaymentMethod();

        $appointment = null;
        if ($this->shouldCreateAppointment($status)) {
            $appointmentStatus = $this->getAppointmentStatus($status);
            $referenceCode = $appointmentStatus === 'completed' ? null : 'APT' . Str::upper(Str::random(8));
            $appointmentPaymentStatus = $this->getPaymentStatus($appointmentStatus);

            $appointment = Appointment::create([
                'patient_id' => $patient->id,
                'service_id' => $service->id,
                'patient_hmo_id' => null,
                'date' => $day->toDateString(),
                'time_slot' => $timeSlotLabel,
                'reference_code' => $referenceCode,
                'status' => $appointmentStatus,
                'payment_method' => $paymentMethod,
                'payment_status' => $appointmentPaymentStatus,
                'notes' => $this->generateAppointmentNote(),
                'dentist_schedule_id' => $dentistScheduleId,
                'honor_preferred_dentist' => false,
                'is_seeded' => true,
                'created_at' => $startTime->copy()->subHours(rand(12, 36)),
                'updated_at' => $startTime->copy()->subHours(rand(1, 4)),
            ]);
        }

        $medicalHistoryStatus = match ($status) {
            'completed' => 'completed',
            'pending' => 'pending',
            default => 'skipped',
        };
        $consultationStartedAt = $status === 'completed'
            ? $startTime->copy()->addMinutes(rand(5, 20))
            : null;
        $visitCodeSentAt = $status === 'completed' && $dentistScheduleId
            ? $startTime->copy()->subMinutes(rand(10, 25))
            : null;
        $visitCode = null;
        if ($status === 'pending') {
            $visitCode = rand(1, 100) <= 50 ? PatientVisit::generateVisitCode() : null;
        }

        $visit = PatientVisit::create([
            'patient_id' => $patient->id,
            'appointment_id' => $appointment?->id,
            'service_id' => $service->id,
            'dentist_schedule_id' => $dentistScheduleId,
            'visit_date' => $day->toDateString(),
            'start_time' => $startTime,
            'end_time' => $status === 'pending' ? null : $endTime,
            'status' => $status,
            'visit_code' => $visitCode,
            'consultation_started_at' => $consultationStartedAt,
            'visit_code_sent_at' => $visitCodeSentAt,
            'receipt_sent_at' => null,
            'receipt_sent_to' => null,
            'is_seeded' => true,
            'medical_history_status' => $medicalHistoryStatus,
            'medical_history_id' => null,
            'created_at' => $startTime->copy()->subHours(rand(24, 72)),
            'updated_at' => $status === 'pending' ? $startTime : $endTime,
        ]);

        $medicalHistory = null;
        if ($status === 'completed') {
            $medicalHistory = $this->createMedicalHistory($visit, $patient);
            $visit->forceFill([
                'medical_history_id' => $medicalHistory->id,
            ])->save();
        }

        $this->createVisitNotes($visit, $status);

        $payment = null;
        if ($status === 'completed') {
            $payment = $this->createVisitPayment($visit, $service, $paymentMethod, $appointment);
        }

        $this->updateSlotUsage($slotUsage, $timeSlotLabel, $endTime, $grid);

        return [
            'visit' => $visit,
            'appointment' => $appointment,
            'payment' => $payment,
        ];
    }

    private function determineDuration(Service $service, string $status): int
    {
        if ($status === 'pending') {
            return rand(45, 90);
        }

        if ($status !== 'completed') {
            return rand(20, 45);
        }

        $estimated = $service->estimated_minutes ?? null;
        if (!$estimated) {
            return rand(45, 90);
        }

        $variance = rand(-15, 20);
        return max(30, min(180, $estimated + $variance));
    }

    private function createMedicalHistory(PatientVisit $visit, Patient $patient): PatientMedicalHistory
    {
        $birthdate = $patient->birthdate ? Carbon::parse($patient->birthdate) : null;
        $age = $birthdate ? $birthdate->age : rand(18, 70);

        return PatientMedicalHistory::create([
            'patient_id' => $patient->id,
            'patient_visit_id' => $visit->id,
            'full_name' => trim($patient->first_name . ' ' . $patient->last_name),
            'age' => $age,
            'sex' => $patient->sex,
            'address' => $patient->address,
            'contact_number' => $patient->contact_number,
            'occupation' => $this->faker->jobTitle(),
            'date_of_birth' => $birthdate,
            'email' => $patient->user?->email,
            'previous_dentist' => $this->faker->name(),
            'last_dental_visit' => Carbon::now()->subMonths(rand(3, 12)),
            'physician_name' => $this->faker->name(),
            'physician_address' => $this->faker->address(),
            'in_good_health' => true,
            'under_medical_treatment' => false,
            'medical_treatment_details' => null,
            'serious_illness_surgery' => false,
            'illness_surgery_details' => null,
            'hospitalized' => false,
            'hospitalization_details' => null,
            'taking_medications' => rand(1, 100) <= 20,
            'medications_list' => rand(1, 100) <= 20 ? 'Vitamin supplements' : null,
            'uses_tobacco' => rand(1, 100) <= 15,
            'uses_alcohol_drugs' => rand(1, 100) <= 25,
            'allergic_local_anesthetic' => false,
            'allergic_penicillin' => false,
            'allergic_sulfa' => false,
            'allergic_aspirin' => false,
            'allergic_latex' => false,
            'allergic_others' => null,
            'is_pregnant' => false,
            'is_nursing' => false,
            'taking_birth_control' => false,
            'blood_type' => $this->faker->randomElement(['A+', 'B+', 'O+', 'AB+', 'A-', 'O-']),
            'blood_pressure' => $this->faker->randomElement(['110/70', '120/80', '125/85']),
            'bleeding_time' => $this->faker->randomElement(['Normal', 'Slightly prolonged']),
            'high_blood_pressure' => rand(0, 1) === 1,
            'low_blood_pressure' => false,
            'heart_disease' => false,
            'heart_murmur' => false,
            'chest_pain' => false,
            'stroke' => false,
            'diabetes' => rand(1, 100) <= 10,
            'hepatitis' => false,
            'tuberculosis' => false,
            'kidney_disease' => false,
            'cancer' => false,
            'asthma' => rand(1, 100) <= 10,
            'anemia' => false,
            'arthritis' => rand(1, 100) <= 12,
            'epilepsy' => false,
            'aids_hiv' => false,
            'stomach_troubles' => rand(1, 100) <= 15,
            'thyroid_problems' => rand(1, 100) <= 8,
            'hay_fever' => rand(1, 100) <= 10,
            'head_injuries' => rand(1, 100) <= 5,
            'rapid_weight_loss' => false,
            'joint_replacement' => rand(1, 100) <= 5,
            'radiation_therapy' => false,
            'swollen_ankles' => false,
            'other_conditions' => null,
            'completed_by' => $this->adminUser->id,
            'completed_at' => $visit->start_time?->copy()->subMinutes(15) ?? now(),
        ]);
    }

    private function createVisitNotes(PatientVisit $visit, string $status): void
    {
        if ($status === 'pending') {
            return;
        }

        $notes = match ($status) {
            'completed' => [
                'dentist_notes' => 'Completed treatment successfully. Patient tolerated the procedure well.',
                'findings' => 'Routine follow-up recommended.',
                'plan' => 'Schedule next cleaning in 6 months.',
            ],
            'inquiry' => [
                'dentist_notes' => 'Inquiry only: Patient asked about service offerings and pricing.',
                'findings' => null,
                'plan' => null,
            ],
            'rejected' => [
                'dentist_notes' => 'Visit rejected: Patient left before consultation could begin.',
                'findings' => null,
                'plan' => 'Recommended to rebook at a later date.',
            ],
            default => [
                'dentist_notes' => null,
                'findings' => null,
                'plan' => null,
            ],
        };

        VisitNote::create([
            'patient_visit_id' => $visit->id,
            'dentist_notes_encrypted' => $notes['dentist_notes'],
            'findings_encrypted' => $notes['findings'],
            'treatment_plan_encrypted' => $notes['plan'],
            'teeth_treated' => null,
            'created_by' => $this->adminUser->id,
            'updated_by' => $this->adminUser->id,
            'last_accessed_at' => null,
            'last_accessed_by' => null,
        ]);
    }

    private function createVisitPayment(
        PatientVisit $visit,
        Service $service,
        string $method,
        ?Appointment $appointment
    ): Payment {
        $amount = $service->price ?? 0;

        $payment = Payment::create([
            'appointment_id' => $appointment?->id,
            'patient_visit_id' => $visit->id,
            'currency' => 'PHP',
            'amount_due' => $amount,
            'amount_paid' => $amount,
            'method' => $method,
            'status' => Payment::STATUS_PAID,
            'reference_no' => strtoupper($method) . '-' . Str::upper(Str::random(10)),
            'paid_at' => $visit->end_time ?? now(),
            'created_by' => $this->adminUser->id,
            'created_at' => $visit->end_time ?? now(),
            'updated_at' => $visit->end_time ?? now(),
        ]);

        if ($appointment) {
            $appointment->update([
                'payment_status' => 'paid',
            ]);
        }

        return $payment;
    }

    private function shouldCreateAppointment(string $visitStatus): bool
    {
        if ($visitStatus === 'rejected') {
            return rand(1, 100) <= 40;
        }

        if ($visitStatus === 'pending') {
            return rand(1, 100) <= 55;
        }

        return rand(1, 100) <= 65;
    }

    private function generateTimeSlotWithCapacity(
        Carbon $day,
        array $slotUsage,
        int $capacity,
        array $grid,
        int $duration
    ): ?array {
        $attempts = 0;
        $maxAttempts = max(10, count($grid) * 2);

        while ($attempts < $maxAttempts) {
            $slot = $grid[array_rand($grid)];
            [$hour, $minute] = array_map('intval', explode(':', $slot));

            $start = $day->copy()->setTime($hour, $minute, 0);
            $end = $start->copy()->addMinutes($duration);

            if ($this->canFitInSlot($slotUsage, $slot, $duration, $capacity, $grid)) {
                return [
                    'start' => $start,
                    'end' => $end,
                    'slot' => sprintf('%02d:%02d-%02d:%02d', $hour, $minute, $end->hour, $end->minute),
                ];
            }

            $attempts++;
        }

        return null;
    }

    private function canFitInSlot(
        array $slotUsage,
        string $startSlot,
        int $duration,
        int $capacity,
        array $grid
    ): bool {
        $startTime = Carbon::createFromFormat('H:i', $startSlot);
        $endTime = $startTime->copy()->addMinutes($duration);

        $current = $startTime->copy();
        while ($current->lt($endTime)) {
            $slotKey = $current->format('H:i');
            if (!array_key_exists($slotKey, $slotUsage)) {
                return false;
            }
            if ($slotUsage[$slotKey] >= $capacity) {
                return false;
            }
            $current->addMinutes(30);
        }

        return true;
    }

    private function updateSlotUsage(array &$slotUsage, string $timeSlot, Carbon $endTime, array $grid): void
    {
        if (strpos($timeSlot, '-') === false) {
            return;
        }

        [$start, $ignored] = explode('-', $timeSlot, 2);
        $startTime = Carbon::createFromFormat('H:i', trim($start));
        $current = $startTime->copy();

        while ($current->lt($endTime)) {
            $slotKey = $current->format('H:i');
            if (array_key_exists($slotKey, $slotUsage)) {
                $slotUsage[$slotKey]++;
            }
            $current->addMinutes(30);
        }
    }

    private function getVisitStatus(Carbon $day): string
    {
        // Restricted to not create pending visits
        // Only creates: completed, inquiry, or rejected
        $rand = rand(1, 100);
        if ($rand <= 84) {
            return 'completed';
        }
        if ($rand <= 95) {
            return 'inquiry';
        }
        return 'rejected';
    }

    private function getAppointmentStatus(string $visitStatus): string
    {
        $rand = rand(1, 100);
        if ($rand <= 7) {
            return 'no_show';
        }

        return match ($visitStatus) {
            'completed' => 'completed',
            'inquiry' => 'approved',
            'rejected' => 'cancelled',
            default => 'approved',
        };
    }

    private function getPaymentMethod(): string
    {
        $methods = ['cash', 'maya', 'hmo'];
        return $methods[array_rand($methods)];
    }

    private function getPaymentStatus(string $appointmentStatus): string
    {
        if ($appointmentStatus === 'completed') {
            return rand(1, 100) <= 88 ? 'paid' : 'unpaid';
        }

        return 'unpaid';
    }

    private function generateAppointmentNote(): ?string
    {
        $notes = [
            'Patient confirmed appointment',
            'Reminder sent to patient',
            'Walk-in converted to appointment',
            'Follow-up requested by patient',
            null,
            null,
        ];

        return $notes[array_rand($notes)];
    }
}


