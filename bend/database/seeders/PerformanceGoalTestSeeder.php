<?php

namespace Database\Seeders;

use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use App\Models\Service;
use App\Models\ServiceBundleItem;
use App\Models\ServiceDiscount;
use App\Models\Patient;
use App\Models\PatientVisit;
use App\Models\Payment;
use App\Models\VisitNote;
use App\Models\PatientHmo;
use App\Models\User;
use Carbon\Carbon;

class PerformanceGoalTestSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Create test services
        $this->createTestServices();
        
        // Create test packages (service bundles)
        $this->createTestPackages();
        
        // Create test promos (service discounts)
        $this->createTestPromos();
        
        // Create test patients
        $this->createTestPatients();
        
        // Create test visits for current month
        $this->createTestVisits();
    }

    private function createTestServices()
    {
        // Get categories for mapping
        $categories = \App\Models\ServiceCategory::all()->keyBy('name');
        
        $services = [
            [
                'name' => 'Regular Cleaning',
                'description' => 'Basic dental cleaning service',
                'price' => 1500.00,
                'category_name' => 'Preventive',
                'estimated_minutes' => 60,
            ],
            [
                'name' => 'Deep Cleaning',
                'description' => 'Thorough dental cleaning',
                'price' => 2500.00,
                'category_name' => 'Preventive',
                'estimated_minutes' => 90,
            ],
            [
                'name' => 'Tooth Extraction',
                'description' => 'Simple tooth extraction',
                'price' => 3000.00,
                'category_name' => 'Surgical',
                'estimated_minutes' => 45,
            ],
            [
                'name' => 'Dental Filling',
                'description' => 'Tooth filling service',
                'price' => 2000.00,
                'category_name' => 'Restorative',
                'estimated_minutes' => 30,
            ],
            [
                'name' => 'Dental Checkup Package',
                'description' => 'Complete dental checkup package',
                'price' => 3500.00,
                'category_name' => 'Other',
                'estimated_minutes' => 120,
            ],
            [
                'name' => 'Whitening Treatment',
                'description' => 'Professional teeth whitening',
                'price' => 8000.00,
                'category_name' => 'Cosmetic',
                'estimated_minutes' => 90,
            ],
        ];

        foreach ($services as $service) {
            $categoryName = $service['category_name'];
            unset($service['category_name']);
            
            $category = $categories->get($categoryName);
            if ($category) {
                $service['service_category_id'] = $category->id;
            }
            
            Service::updateOrCreate(
                ['name' => $service['name']],
                $service
            );
        }
    }

    private function createTestPackages()
    {
        // Get the package service and individual services
        $packageService = Service::where('name', 'Dental Checkup Package')->first();
        $cleaningService = Service::where('name', 'Regular Cleaning')->first();
        $fillingService = Service::where('name', 'Dental Filling')->first();

        if ($packageService && $cleaningService && $fillingService) {
            // Create bundle items (services included in the package)
            ServiceBundleItem::updateOrCreate([
                'parent_service_id' => $packageService->id,
                'child_service_id' => $cleaningService->id,
            ]);

            ServiceBundleItem::updateOrCreate([
                'parent_service_id' => $packageService->id,
                'child_service_id' => $fillingService->id,
            ]);
        }
    }

    private function createTestPromos()
    {
        $whiteningService = Service::where('name', 'Whitening Treatment')->first();
        $cleaningService = Service::where('name', 'Regular Cleaning')->first();

        if ($whiteningService) {
            // Create ongoing promo (started yesterday, ends in 2 weeks)
            ServiceDiscount::updateOrCreate([
                'service_id' => $whiteningService->id,
                'start_date' => Carbon::yesterday(),
            ], [
                'end_date' => Carbon::now()->addWeeks(2),
                'discounted_price' => 6000.00,
                'status' => 'launched',
                'activated_at' => Carbon::yesterday(),
            ]);
        }

        if ($cleaningService) {
            // Create future promo (starts in 1 week, ends in 3 weeks)
            ServiceDiscount::updateOrCreate([
                'service_id' => $cleaningService->id,
                'start_date' => Carbon::now()->addWeek(),
            ], [
                'end_date' => Carbon::now()->addWeeks(3),
                'discounted_price' => 1000.00,
                'status' => 'planned',
            ]);

            // Create another ongoing promo (started 3 days ago, ends in 10 days)
            ServiceDiscount::updateOrCreate([
                'service_id' => $cleaningService->id,
                'start_date' => Carbon::now()->subDays(3),
            ], [
                'end_date' => Carbon::now()->addDays(10),
                'discounted_price' => 1200.00,
                'status' => 'launched',
                'activated_at' => Carbon::now()->subDays(3),
            ]);
        }
    }

    private function createTestPatients()
    {
        $patients = [
            [
                'first_name' => 'John',
                'last_name' => 'Doe',
                'contact_number' => '09123456789',
                'birthdate' => '1990-05-15',
                'sex' => 'Male',
                'address' => '123 Main St, City',
            ],
            [
                'first_name' => 'Jane',
                'last_name' => 'Smith',
                'contact_number' => '09987654321',
                'birthdate' => '1985-08-22',
                'sex' => 'Female',
                'address' => '456 Oak Ave, City',
            ],
            [
                'first_name' => 'Bob',
                'last_name' => 'Johnson',
                'contact_number' => '09555123456',
                'birthdate' => '1978-12-03',
                'sex' => 'Male',
                'address' => '789 Pine Rd, City',
            ],
            [
                'first_name' => 'Alice',
                'last_name' => 'Brown',
                'contact_number' => '09444987654',
                'birthdate' => '1992-03-18',
                'sex' => 'Female',
                'address' => '321 Elm St, City',
            ],
            [
                'first_name' => 'Charlie',
                'last_name' => 'Wilson',
                'contact_number' => '09333456789',
                'birthdate' => '1988-07-10',
                'sex' => 'Male',
                'address' => '654 Maple Dr, City',
            ],
        ];

        foreach ($patients as $patient) {
            Patient::updateOrCreate(
                ['contact_number' => $patient['contact_number']],
                $patient
            );
        }
    }

    private function createTestVisits()
    {
        $services = Service::all();
        $patients = Patient::all();
        
        if ($services->isEmpty() || $patients->isEmpty()) {
            return;
        }

        // Get current month start and end
        $monthStart = Carbon::now()->startOfMonth();
        $monthEnd = Carbon::now()->endOfMonth();
        
        // Create visits for current month (only completed visits for past dates)
        $visitsData = [];
        
        // Create 15 completed visits this month
        for ($i = 0; $i < 15; $i++) {
            $visitDate = $monthStart->copy()->addDays(rand(0, min(Carbon::now()->day - 1, $monthEnd->day - 1)));
            $patient = $patients->random();
            $service = $services->random();
            
            $visitsData[] = [
                'patient_id' => $patient->id,
                'service_id' => $service->id,
                'visit_date' => $visitDate->toDateString(),
                'start_time' => $visitDate->copy()->setTime(rand(8, 16), [0, 30][rand(0, 1)]),
                'end_time' => $visitDate->copy()->setTime(rand(8, 16), [0, 30][rand(0, 1)])->addMinutes($service->estimated_minutes ?? 60),
                'status' => 'completed',
                'is_seeded' => true,
            ];
        }
        
        // Create some visits for specific services to test service/package/promo goals
        $cleaningService = Service::where('name', 'Regular Cleaning')->first();
        $packageService = Service::where('name', 'Dental Checkup Package')->first();
        $whiteningService = Service::where('name', 'Whitening Treatment')->first();
        
        // Add specific visits for cleaning service (for service availment testing)
        if ($cleaningService) {
            for ($i = 0; $i < 8; $i++) {
                $visitDate = $monthStart->copy()->addDays(rand(0, min(Carbon::now()->day - 1, $monthEnd->day - 1)));
                $patient = $patients->random();
                
                $visitsData[] = [
                    'patient_id' => $patient->id,
                    'service_id' => $cleaningService->id,
                    'visit_date' => $visitDate->toDateString(),
                    'start_time' => $visitDate->copy()->setTime(rand(8, 16), [0, 30][rand(0, 1)]),
                    'end_time' => $visitDate->copy()->setTime(rand(8, 16), [0, 30][rand(0, 1)])->addMinutes(60),
                    'status' => 'completed',
                    'is_seeded' => true,
                ];
            }
        }
        
        // Add specific visits for package service (for package availment testing)
        if ($packageService) {
            for ($i = 0; $i < 3; $i++) {
                $visitDate = $monthStart->copy()->addDays(rand(0, min(Carbon::now()->day - 1, $monthEnd->day - 1)));
                $patient = $patients->random();
                
                $visitsData[] = [
                    'patient_id' => $patient->id,
                    'service_id' => $packageService->id,
                    'visit_date' => $visitDate->toDateString(),
                    'start_time' => $visitDate->copy()->setTime(rand(8, 16), [0, 30][rand(0, 1)]),
                    'end_time' => $visitDate->copy()->setTime(rand(8, 16), [0, 30][rand(0, 1)])->addMinutes(120),
                    'status' => 'completed',
                    'is_seeded' => true,
                ];
            }
        }
        
        // Add specific visits for whitening during promo period (for promo availment testing)
        if ($whiteningService) {
            // Create visits during the ongoing promo period
            for ($i = 0; $i < 5; $i++) {
                $visitDate = Carbon::now()->subDays(rand(0, 1)); // Within promo period
                $patient = $patients->random();
                
                $visitsData[] = [
                    'patient_id' => $patient->id,
                    'service_id' => $whiteningService->id,
                    'visit_date' => $visitDate->toDateString(),
                    'start_time' => $visitDate->copy()->setTime(rand(8, 16), [0, 30][rand(0, 1)]),
                    'end_time' => $visitDate->copy()->setTime(rand(8, 16), [0, 30][rand(0, 1)])->addMinutes(90),
                    'status' => 'completed',
                    'is_seeded' => true,
                ];
            }
        }
        
        // Insert all visits
        $completedVisits = [];
        foreach ($visitsData as $visitData) {
            $visit = PatientVisit::updateOrCreate([
                'patient_id' => $visitData['patient_id'],
                'service_id' => $visitData['service_id'],
                'visit_date' => $visitData['visit_date'],
                'start_time' => $visitData['start_time'],
            ], $visitData);
            
            // Create visit notes for completed visits to simulate real-world usage
            if ($visit->status === 'completed') {
                $this->createVisitNote($visit, $visitData);
                $completedVisits[] = $visit;
            }
        }
        
        // Create Payment records for all completed visits
        $this->createPaymentsForCompletedVisits($completedVisits);
        
        // Create sample HMO data for patients to simulate real-world usage
        $this->createSampleHmoData();
    }
    
    /**
     * Create Payment records for completed visits
     */
    private function createPaymentsForCompletedVisits(array $completedVisits): void
    {
        // Get an admin user for created_by
        $adminUser = User::where('role', 'admin')->first();
        
        foreach ($completedVisits as $visit) {
            $service = $visit->service;
            $amount = $service ? $service->price : 2000; // Default amount if no service

            Payment::updateOrCreate([
                'patient_visit_id' => $visit->id,
            ], [
                'appointment_id' => null,
                'currency' => 'PHP',
                'amount_due' => $amount,
                'amount_paid' => $amount,
                'method' => 'cash', // Default to cash for seeded visits
                'status' => 'paid',
                'reference_no' => 'PERF-PAY-' . strtoupper(uniqid()),
                'paid_at' => $visit->end_time ?? $visit->created_at,
                'created_by' => $adminUser?->id,
                'created_at' => $visit->created_at,
                'updated_at' => $visit->created_at,
            ]);
        }
        
        if (count($completedVisits) > 0) {
            $this->command?->info('Created ' . count($completedVisits) . ' Payment records for completed visits in PerformanceGoalTestSeeder.');
        }
    }
    
    /**
     * Create realistic visit notes for completed visits
     */
    private function createVisitNote(PatientVisit $visit, array $visitData): void
    {
        // Get a random dentist user for the notes
        $dentist = User::where('role', 'dentist')->inRandomOrder()->first();
        
        if (!$dentist) {
            return; // Skip if no dentist available
        }
        
        $serviceName = $visit->service->name ?? 'General Service';
        $patientName = $visit->patient->first_name . ' ' . $visit->patient->last_name;
        
        // Create realistic notes based on the service type
        $notes = $this->generateRealisticNotes($serviceName, $patientName);
        
        VisitNote::updateOrCreate(
            ['patient_visit_id' => $visit->id],
            [
                'dentist_notes_encrypted' => $notes['dentist_notes'],
                'findings_encrypted' => $notes['findings'],
                'treatment_plan_encrypted' => $notes['treatment_plan'],
                'created_by' => $dentist->id,
                'updated_by' => $dentist->id,
                'last_accessed_at' => now(),
                'last_accessed_by' => $dentist->id,
            ]
        );
    }
    
    /**
     * Generate realistic notes based on service type
     */
    private function generateRealisticNotes(string $serviceName, string $patientName): array
    {
        $notes = [
            'dentist_notes' => '',
            'findings' => '',
            'treatment_plan' => ''
        ];
        
        // Service-specific note templates
        if (str_contains($serviceName, 'Cleaning')) {
            $notes['dentist_notes'] = "Performed routine dental cleaning for {$patientName}. Patient showed good oral hygiene habits.";
            $notes['findings'] = "Mild plaque buildup in posterior teeth. No signs of gum disease. Overall oral health is good.";
            $notes['treatment_plan'] = "Continue regular brushing and flossing. Schedule next cleaning in 6 months.";
        } elseif (str_contains($serviceName, 'Checkup')) {
            $notes['dentist_notes'] = "Comprehensive dental examination completed for {$patientName}. Patient was cooperative during examination.";
            $notes['findings'] = "No cavities detected. Gum health is within normal parameters. All teeth are stable.";
            $notes['treatment_plan'] = "Maintain current oral hygiene routine. Return for regular checkup in 6 months.";
        } elseif (str_contains($serviceName, 'Package')) {
            $notes['dentist_notes'] = "Complete dental package service provided to {$patientName}. All procedures completed successfully.";
            $notes['findings'] = "Patient responded well to treatment. No complications during procedures.";
            $notes['treatment_plan'] = "Follow-up appointment scheduled. Patient advised on post-treatment care.";
        } elseif (str_contains($serviceName, 'Whitening')) {
            $notes['dentist_notes'] = "Teeth whitening procedure completed for {$patientName}. Patient satisfied with results.";
            $notes['findings'] = "Good candidate for whitening treatment. No sensitivity issues reported.";
            $notes['treatment_plan'] = "Avoid staining foods for 48 hours. Use provided maintenance products.";
        } else {
            // Generic notes for other services
            $notes['dentist_notes'] = "Dental service completed for {$patientName}. Procedure went smoothly.";
            $notes['findings'] = "Patient responded well to treatment. No adverse reactions observed.";
            $notes['treatment_plan'] = "Continue regular oral hygiene. Follow any specific post-treatment instructions provided.";
        }
        
        return $notes;
    }
    
    /**
     * Create sample HMO data for patients
     */
    private function createSampleHmoData(): void
    {
        $hmoProviders = [
            'Maxicare Healthcare Corporation',
            'PhilHealth',
            'Intellicare',
            'Medicard Philippines',
            'EastWest Health Care',
            'Caritas Health Shield',
            'Health Maintenance Inc.',
            'Value Care Health System'
        ];
        
        $patients = Patient::all();
        $staffUser = User::where('role', 'staff')->first();
        
        foreach ($patients as $patient) {
            // Randomly assign 1-2 HMOs per patient
            $numHmos = rand(1, 2);
            
            for ($i = 0; $i < $numHmos; $i++) {
                $provider = $hmoProviders[array_rand($hmoProviders)];
                $hmoNumber = 'HMO' . str_pad(rand(100000, 999999), 6, '0', STR_PAD_LEFT);
                $patientNameOnCard = $patient->first_name . ' ' . $patient->last_name;
                
                PatientHmo::updateOrCreate(
                    [
                        'patient_id' => $patient->id,
                        'provider_name' => $provider,
                        'hmo_number' => $hmoNumber,
                    ],
                    [
                        'patient_fullname_on_card' => $patientNameOnCard,
                        'is_primary' => $i === 0, // First HMO is primary
                        'author_id' => $staffUser?->id,
                    ]
                );
            }
        }
    }
}