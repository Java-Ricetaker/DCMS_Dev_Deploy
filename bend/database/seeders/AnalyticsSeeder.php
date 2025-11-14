<?php

namespace Database\Seeders;

use App\Models\Appointment;
use App\Models\Patient;
use App\Models\PatientMedicalHistory;
use App\Models\PatientVisit;
use App\Models\Payment;
use App\Models\PerformanceGoal;
use App\Models\GoalProgressSnapshot;
use App\Models\Service;
use App\Models\ServiceDiscount;
use App\Models\User;
use App\Models\VisitNote;
use App\Models\InventoryItem;
use App\Models\InventoryBatch;
use App\Models\InventoryMovement;
use App\Models\Supplier;
use App\Models\VisitAdditionalCharge;
use App\Models\DentistSchedule;
use App\Services\ClinicDateResolverService;
use Carbon\Carbon;
use Database\Seeders\Support\RealisticVisitFactory;
use Illuminate\Database\Eloquent\Collection as EloquentCollection;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

class AnalyticsSeeder extends Seeder
{
    /**
     * Seed comprehensive analytics data for 1 year to test admin analytics and monthly reports.
     * 
     * This seeder respects the system's clinic schedule and visit flow:
     * - Only creates visits on days when clinic is open (via ClinicDateResolverService)
     * - Pending visits, completed visits, and inquiries follow the live workflow
     * - Proper visit codes are generated where appropriate
     * - Appointments and visits are properly linked
     * - Payments are correctly linked to completed visits
     */
    public function run(): void
    {
        $this->command->info('Starting AnalyticsSeeder - generating 1 year of comprehensive data...');

        // Clear existing analytics data
        $this->clearExistingData();

        // Get required data
        $patients = $this->ensurePatients();
        $services = $this->ensureServices();
        $adminUser = User::where('role', 'admin')->first();
        
        // Setup inventory for loss tracking
        $this->setupInventory($adminUser);

        if (!$adminUser) {
            $this->command->error('No admin user found. Please run UserSeeder first.');
            return;
        }

        // Generate 1 year of data - only past dates, not current day or future
        $startDate = Carbon::now()->subYear()->startOfMonth();
        $endDate = Carbon::now()->subDay()->endOfDay(); // Exclude today and future

        $this->command->info("Generating data from {$startDate->format('Y-m-d')} to {$endDate->format('Y-m-d')}");

        // Generate performance goals
        $this->generatePerformanceGoals($adminUser, $startDate);

        // Generate monthly data
        $visitFactory = new RealisticVisitFactory($adminUser);

        $current = $startDate->copy();
        while ($current->lte($endDate)) {
            $this->generateMonthData($current, $patients, $services, $visitFactory);
            $this->generateInventoryLoss($current, $adminUser);
            $current->addMonth();
        }

        // Generate goal progress snapshots
        $this->generateGoalProgressSnapshots($startDate, $endDate);

        $this->command->info('AnalyticsSeeder completed successfully!');
        $this->displaySummary();
    }

    private function clearExistingData(): void
    {
        $this->command->info('Clearing existing analytics data...');
        
        DB::statement('SET FOREIGN_KEY_CHECKS=0;');
        VisitAdditionalCharge::truncate();
        InventoryMovement::truncate();
        InventoryBatch::truncate();
        InventoryItem::truncate();
        Payment::truncate();
        PatientVisit::truncate();
        VisitNote::truncate();
        PatientMedicalHistory::truncate();
        Appointment::truncate();
        GoalProgressSnapshot::truncate();
        PerformanceGoal::truncate();
        Supplier::truncate();
        DB::statement('SET FOREIGN_KEY_CHECKS=1;');
    }

    private function ensurePatients(): EloquentCollection
    {
        $patients = Patient::with('user')->get();
        
        if ($patients->count() < 50) {
            $this->command->info('Generating additional patients for analytics...');
            
            $faker = \Faker\Factory::create();
            $newPatients = [];
            
            for ($i = 0; $i < 50; $i++) {
                $newPatients[] = [
                    'first_name' => $faker->firstName(),
                    'last_name' => $faker->lastName(),
                    'middle_name' => $faker->optional(0.7)->firstName(),
                    'birthdate' => $faker->dateTimeBetween('-80 years', '-18 years')->format('Y-m-d'),
                    'sex' => $faker->randomElement(['male', 'female']),
                    'contact_number' => '09' . $faker->numerify('########'),
                    'address' => $faker->city() . ', ' . $faker->state(),
                    'is_linked' => false,
                    'created_at' => now(),
                    'updated_at' => now(),
                ];
            }
            
            Patient::insert($newPatients);
            $patients = Patient::with('user')->get();
        }
        
        return $patients;
    }

    private function ensureServices(): EloquentCollection
    {
        $services = Service::where('is_active', true)->get();
        
        if ($services->count() < 10) {
            $this->command->info('Generating additional services for analytics...');
            
            // Get categories for mapping
            $categories = \App\Models\ServiceCategory::all()->keyBy('name');
            
            $additionalServices = [
                ['name' => 'Root Canal Treatment', 'price' => 8000, 'category_name' => 'Restorative', 'estimated_minutes' => 120],
                ['name' => 'Crown Placement', 'price' => 12000, 'category_name' => 'Restorative', 'estimated_minutes' => 90],
                ['name' => 'Orthodontic Consultation', 'price' => 1500, 'category_name' => 'Orthodontic', 'estimated_minutes' => 30],
                ['name' => 'Dental Implant', 'price' => 25000, 'category_name' => 'Surgical', 'estimated_minutes' => 180],
                ['name' => 'Gum Treatment', 'price' => 4000, 'category_name' => 'Preventive', 'estimated_minutes' => 60],
                ['name' => 'Oral Surgery', 'price' => 15000, 'category_name' => 'Surgical', 'estimated_minutes' => 120],
                ['name' => 'Dental Checkup', 'price' => 1000, 'category_name' => 'Preventive', 'estimated_minutes' => 20],
                ['name' => 'X-Ray', 'price' => 500, 'category_name' => 'Other', 'estimated_minutes' => 10],
            ];
            
            foreach ($additionalServices as $service) {
                $categoryName = $service['category_name'];
                unset($service['category_name']);
                
                $category = $categories->get($categoryName);
                if ($category) {
                    $service['service_category_id'] = $category->id;
                }
                
                Service::create(array_merge($service, [
                    'description' => 'Professional ' . strtolower($service['name']),
                    'is_excluded_from_analytics' => false,
                    'is_special' => false,
                    'special_start_date' => null,
                    'special_end_date' => null,
                ]));
            }
            
            $services = Service::where('is_active', true)->get();
        }
        
        return $services;
    }

    private function generatePerformanceGoals(User $adminUser, Carbon $startDate): void
    {
        $this->command->info('Generating performance goals...');
        
        // Get some services for specific goal types
        $services = Service::where('is_active', true)->get();
        $serviceDiscounts = ServiceDiscount::where('status', 'launched')->get();
        
        $goals = [
            [
                'period_type' => 'monthly',
                'period_start' => $startDate->copy()->startOfMonth(),
                'period_end' => $startDate->copy()->endOfMonth(),
                'metric' => 'total_visits',
                'target_value' => 200,
                'status' => 'active',
                'service_id' => null,
                'package_id' => null,
                'promo_id' => null,
            ],
            [
                'period_type' => 'monthly',
                'period_start' => $startDate->copy()->startOfMonth(),
                'period_end' => $startDate->copy()->endOfMonth(),
                'metric' => 'revenue',
                'target_value' => 500000,
                'status' => 'active',
                'service_id' => null,
                'package_id' => null,
                'promo_id' => null,
            ],
            [
                'period_type' => 'monthly',
                'period_start' => $startDate->copy()->startOfMonth(),
                'period_end' => $startDate->copy()->endOfMonth(),
                'metric' => 'appointment_completion_rate',
                'target_value' => 85,
                'status' => 'active',
                'service_id' => null,
                'package_id' => null,
                'promo_id' => null,
            ],
        ];
        
        // Add service-specific goals if services exist
        if ($services->isNotEmpty()) {
            $service = $services->first();
            $goals[] = [
                'period_type' => 'monthly',
                'period_start' => $startDate->copy()->startOfMonth(),
                'period_end' => $startDate->copy()->endOfMonth(),
                'metric' => 'service_availment',
                'target_value' => 50,
                'status' => 'active',
                'service_id' => $service->id,
                'package_id' => null,
                'promo_id' => null,
            ];
        }
        
        // Add package-specific goals if we have package services
        $packageService = $services->where('category', 'Package')->first();
        if ($packageService) {
            $goals[] = [
                'period_type' => 'monthly',
                'period_start' => $startDate->copy()->startOfMonth(),
                'period_end' => $startDate->copy()->endOfMonth(),
                'metric' => 'package_availment',
                'target_value' => 20,
                'status' => 'active',
                'service_id' => null,
                'package_id' => $packageService->id,
                'promo_id' => null,
            ];
        }
        
        // Add promo-specific goals if we have active promos
        if ($serviceDiscounts->isNotEmpty()) {
            $promo = $serviceDiscounts->first();
            $goals[] = [
                'period_type' => 'monthly',
                'period_start' => $startDate->copy()->startOfMonth(),
                'period_end' => $startDate->copy()->endOfMonth(),
                'metric' => 'promo_availment',
                'target_value' => 15,
                'status' => 'active',
                'service_id' => null,
                'package_id' => null,
                'promo_id' => $promo->id,
            ];
        }
        
        foreach ($goals as $goal) {
            PerformanceGoal::create(array_merge($goal, [
                'created_by' => $adminUser->id,
                'created_at' => now(),
                'updated_at' => now(),
            ]));
        }
    }

    private function generateMonthData(
        Carbon $month,
        EloquentCollection $patients,
        EloquentCollection $services,
        RealisticVisitFactory $visitFactory
    ): void
    {
        $this->command->info("Generating data for {$month->format('Y-m')}...");

        $startOfMonth = $month->copy()->startOfMonth();
        $endOfMonth = $month->copy()->endOfMonth();
        $daysInMonth = $startOfMonth->daysInMonth;
        $resolver = app(ClinicDateResolverService::class);

        $visitCount = 0;
        $appointmentCount = 0;
        $paymentCount = 0;

        // Generate data for each day
        for ($day = 1; $day <= $daysInMonth; $day++) {
            $currentDay = $startOfMonth->copy()->addDays($day - 1);

            // Skip current day and future dates (only generate past dates)
            if ($currentDay->isToday() || $currentDay->isFuture()) {
                continue;
            }

            $snap = $resolver->resolve($currentDay);

            if (!$snap['is_open']) {
                continue;
            }

            if (empty($snap['open_time']) || empty($snap['close_time'])) {
                continue;
            }

            $capacity = max(1, (int) $snap['effective_capacity']);
            $grid = ClinicDateResolverService::buildBlocks($snap['open_time'], $snap['close_time']);

            if (empty($grid)) {
                continue;
            }

            $slotUsage = array_fill_keys($grid, 0);
            $activeDentists = $this->resolveDentistsForDay($currentDay, $snap);

            $maxVisitsToday = min(25, (int) round($capacity * count($grid) * 0.85));
            $targetVisits = min($this->getDailyVisitCount($currentDay), $maxVisitsToday);

            if ($targetVisits <= 0) {
                continue;
            }

            $attempts = 0;
            $createdToday = 0;

            while ($createdToday < $targetVisits && $attempts < $targetVisits * 3) {
                $attempts++;
                $result = $visitFactory->createVisitForDay(
                    $currentDay,
                    $patients,
                    $services,
                    $activeDentists,
                    $slotUsage,
                    $grid,
                    $capacity
                );

                if (!$result['visit']) {
                    continue;
                }

                $createdToday++;
                $visitCount++;
                if ($result['appointment']) {
                    $appointmentCount++;
                }
                if ($result['payment']) {
                    $paymentCount++;
                }
            }
        }

        $this->command->info(
            sprintf(
                "Generated %s: %d visits, %d appointments, %d payments",
                $month->format('Y-m'),
                $visitCount,
                $appointmentCount,
                $paymentCount
            )
        );
    }

    private function getDailyVisitCount(Carbon $day): int
    {
        // More visits on weekdays, fewer on weekends
        if ($day->isWeekend()) {
            return rand(3, 8);
        }
        
        // Seasonal variation
        $month = $day->month;
        $baseCount = 15;
        
        // Higher in summer months (March-May) and December
        if (in_array($month, [3, 4, 5, 12])) {
            $baseCount += 5;
        }
        
        // Lower in January and February
        if (in_array($month, [1, 2])) {
            $baseCount -= 3;
        }
        
        return rand($baseCount - 5, $baseCount + 10);
    }

    private function generateGoalProgressSnapshots(Carbon $startDate, Carbon $endDate): void
    {
        $this->command->info('Generating goal progress snapshots...');
        
        $goals = PerformanceGoal::all();
        $current = $startDate->copy()->startOfMonth();
        
        while ($current->lte($endDate)) {
            foreach ($goals as $goal) {
                $actualValue = $this->calculateGoalProgress($goal, $current);
                
                GoalProgressSnapshot::create([
                    'goal_id' => $goal->id,
                    'as_of_date' => $current->copy()->endOfMonth(),
                    'actual_value' => $actualValue,
                    'created_at' => now(),
                    'updated_at' => now(),
                ]);
            }
            
            $current->addMonth();
        }
    }

    private function calculateGoalProgress(PerformanceGoal $goal, Carbon $month): int
    {
        $startOfMonth = $month->copy()->startOfMonth();
        $endOfMonth = $month->copy()->endOfMonth();
        
        switch ($goal->metric) {
            case 'total_visits':
                return PatientVisit::whereBetween('start_time', [$startOfMonth, $endOfMonth])
                    ->where('status', 'completed')
                    ->count();
                    
            case 'revenue':
                return Payment::whereHas('patientVisit', function ($query) use ($startOfMonth, $endOfMonth) {
                    $query->whereBetween('start_time', [$startOfMonth, $endOfMonth])
                        ->where('status', 'completed');
                })
                ->where('status', 'paid')
                ->sum('amount_paid');
                
            case 'appointment_completion_rate':
                $totalAppointments = Appointment::whereBetween('date', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                    ->where('status', '!=', 'cancelled')
                    ->count();
                    
                $completedAppointments = Appointment::whereBetween('date', [$startOfMonth->toDateString(), $endOfMonth->toDateString()])
                    ->where('status', 'completed')
                    ->count();
                    
                return $totalAppointments > 0 ? round(($completedAppointments / $totalAppointments) * 100) : 0;
                
            default:
                return 0;
        }
    }

    private function displaySummary(): void
    {
        $this->command->info('=== Analytics Data Summary ===');
        $this->command->info('Total Patient Visits: ' . PatientVisit::count());
        
        // Show visit status breakdown
        $visitStatuses = PatientVisit::selectRaw('status, COUNT(*) as count')
            ->groupBy('status')
            ->pluck('count', 'status')
            ->toArray();
        foreach ($visitStatuses as $status => $count) {
            $this->command->info("  - {$status}: {$count}");
        }
        
        $this->command->info('Total Appointments: ' . Appointment::count());
        $this->command->info('Total Payments: ' . Payment::count());
        $this->command->info('Total Performance Goals: ' . PerformanceGoal::count());
        $this->command->info('Total Goal Snapshots: ' . GoalProgressSnapshot::count());
        $this->command->info('Total Visit Notes: ' . VisitNote::count());
        $this->command->info('Total Inventory Items: ' . InventoryItem::count());
        $this->command->info('Total Inventory Batches: ' . InventoryBatch::count());
        $this->command->info('Total Inventory Movements: ' . InventoryMovement::count());
        
        $revenue = Payment::where('status', 'paid')->sum('amount_paid');
        $this->command->info('Total Revenue: ₱' . number_format($revenue, 2));
        
        $lossCost = DB::table('inventory_movements as im')
            ->join('inventory_batches as ib', 'im.batch_id', '=', 'ib.id')
            ->where('im.type', 'adjust')
            ->whereIn('im.adjust_reason', ['expired', 'theft'])
            ->selectRaw('SUM(im.quantity * ib.cost_per_unit) as total_cost')
            ->value('total_cost');
        $this->command->info('Total Inventory Loss Cost: ₱' . number_format($lossCost, 2));
        
        $this->command->info('=== Analytics Seeder Complete ===');
    }

    private function setupInventory(User $adminUser): void
    {
        $this->command->info('Setting up inventory for loss tracking...');
        
        // Create a supplier if none exists
        $supplier = Supplier::first();
        if (!$supplier) {
            $supplier = Supplier::create([
                'name' => 'Medical Supply Co.',
                'contact_person' => 'John Doe',
                'email' => 'supplies@medical.com',
                'phone' => '+1234567890',
                'address' => '123 Supply St, City',
            ]);
        }
        
        // Create inventory items with realistic costs
        $items = [
            [
                'name' => 'Dental Anesthetic',
                'sku_code' => 'ANEST-001',
                'type' => 'drug',
                'unit' => 'ml',
                'low_stock_threshold' => 10,
                'is_controlled' => true,
                'is_sellable' => false,
                'patient_price' => null,
                'created_by' => $adminUser->id,
            ],
            [
                'name' => 'Dental Composite',
                'sku_code' => 'COMP-001',
                'type' => 'supply',
                'unit' => 'g',
                'low_stock_threshold' => 5,
                'is_controlled' => false,
                'is_sellable' => false,
                'patient_price' => null,
                'created_by' => $adminUser->id,
            ],
            [
                'name' => 'Dental Floss',
                'sku_code' => 'FLOSS-001',
                'type' => 'supply',
                'unit' => 'pcs',
                'low_stock_threshold' => 50,
                'is_controlled' => false,
                'is_sellable' => false,
                'patient_price' => null,
                'created_by' => $adminUser->id,
            ],
            [
                'name' => 'Dental X-Ray Film',
                'sku_code' => 'XRAY-001',
                'type' => 'supply',
                'unit' => 'pcs',
                'low_stock_threshold' => 20,
                'is_controlled' => false,
                'is_sellable' => false,
                'patient_price' => null,
                'created_by' => $adminUser->id,
            ],
            [
                'name' => 'Amoxicillin 500mg',
                'sku_code' => 'ABX-001',
                'type' => 'drug',
                'unit' => 'capsules',
                'low_stock_threshold' => 100,
                'is_controlled' => false,
                'is_sellable' => true,
                'patient_price' => 150.00,
                'sellable_notes' => 'Antibiotic for post-dental procedure infection prevention',
                'created_by' => $adminUser->id,
            ],
            [
                'name' => 'Pain Relief Tablets',
                'sku_code' => 'PAIN-001',
                'type' => 'drug',
                'unit' => 'pcs',
                'low_stock_threshold' => 100,
                'is_controlled' => false,
                'is_sellable' => true,
                'patient_price' => 75.00,
                'sellable_notes' => 'Over-the-counter pain relief for post-procedure discomfort',
                'created_by' => $adminUser->id,
            ],
        ];
        
        foreach ($items as $index => $itemData) {
            $item = InventoryItem::create($itemData);
            
            // Define realistic cost ranges for each item type
            $costRanges = [
                'Dental Anesthetic' => [150, 300], // ₱150-300 per ml
                'Dental Composite' => [200, 500],  // ₱200-500 per g
                'Dental Floss' => [5, 15],        // ₱5-15 per piece
                'Dental X-Ray Film' => [25, 50],  // ₱25-50 per piece
                'Amoxicillin 500mg' => [80, 120],  // ₱80-120 per capsule
                'Pain Relief Tablets' => [30, 50], // ₱30-50 per tablet
            ];
            
            $costRange = $costRanges[$item->name] ?? [10, 100];
            
            // Create initial batches for each item
            $batchCount = rand(2, 4);
            for ($i = 0; $i < $batchCount; $i++) {
                $receivedAt = Carbon::now()->subMonths(rand(1, 12))->subDays(rand(0, 30));
                $expiryDate = $item->type === 'drug' ? $receivedAt->copy()->addMonths(rand(12, 36)) : null;
                
                InventoryBatch::create([
                    'item_id' => $item->id,
                    'lot_number' => 'LOT' . strtoupper(uniqid()),
                    'batch_number' => 'BATCH' . strtoupper(uniqid()),
                    'expiry_date' => $expiryDate,
                    'qty_received' => rand(50, 200),
                    'qty_on_hand' => rand(20, 150),
                    'cost_per_unit' => rand($costRange[0], $costRange[1]),
                    'supplier_id' => $supplier->id,
                    'invoice_no' => 'INV' . strtoupper(uniqid()),
                    'invoice_date' => $receivedAt->toDateString(),
                    'received_at' => $receivedAt,
                    'received_by' => $adminUser->id,
                ]);
            }
        }
    }

    private function generateInventoryLoss(Carbon $month, User $adminUser): void
    {
        $startOfMonth = $month->copy()->startOfMonth();
        $endOfMonth = $month->copy()->endOfMonth();
        
        // Get all inventory items
        $items = InventoryItem::with('batches')->get();
        
        // Generate 2-5 loss events per month
        $lossEvents = rand(2, 5);
        
        for ($i = 0; $i < $lossEvents; $i++) {
            $item = $items->random();
            $availableBatches = $item->batches->where('qty_on_hand', '>', 0);
            
            if ($availableBatches->isEmpty()) continue;
            
            $batch = $availableBatches->random();
            
            $lossQuantity = min(rand(1, 10), $batch->qty_on_hand);
            $lossReason = rand(1, 100) <= 70 ? 'expired' : 'theft'; // 70% expired, 30% theft
            
            // Create inventory movement for loss
            InventoryMovement::create([
                'item_id' => $item->id,
                'batch_id' => $batch->id,
                'type' => 'adjust',
                'quantity' => $lossQuantity,
                'adjust_reason' => $lossReason,
                'user_id' => $adminUser->id,
                'notes' => $lossReason === 'expired' ? 'Item expired and disposed' : 'Item reported stolen',
                'created_at' => $startOfMonth->copy()->addDays(rand(1, 28))->addHours(rand(8, 17)),
            ]);
            
            // Update batch quantity
            $batch->qty_on_hand -= $lossQuantity;
            $batch->save();
        }
    }

    private function resolveDentistsForDay(Carbon $day, array $snap): EloquentCollection
    {
        $ids = collect($snap['active_dentist_ids'] ?? [])
            ->filter()
            ->values();

        if ($ids->isNotEmpty()) {
            return DentistSchedule::whereIn('id', $ids)->get();
        }

        return DentistSchedule::activeOnDate($day)->get();
    }
}
