<?php

namespace Database\Seeders;

use App\Models\Service;
use App\Models\ServiceCategory;
use Illuminate\Database\Seeder;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;

class ServiceSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        // Get category IDs
        $categories = ServiceCategory::all()->keyBy('name');
        
        $services = [
            [
                'name' => 'Dental Cleaning',
                'description' => 'Basic oral prophylaxis procedure',
                'price' => 2500,
                'category_name' => 'Preventive',
                'is_excluded_from_analytics' => false,
                'estimated_minutes' => 30,
                'is_special' => false,
                'per_teeth_service' => false,
                'per_tooth_minutes' => null,
                'special_start_date' => null,
                'special_end_date' => null,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Tooth Extraction',
                'description' => 'Simple or surgical removal of tooth',
                'price' => 3000,
                'category_name' => 'Restorative',
                'is_excluded_from_analytics' => true,
                'estimated_minutes' => 60,
                'is_special' => false,
                'per_teeth_service' => true,
                'per_tooth_minutes' => 15,
                'special_start_date' => null,
                'special_end_date' => null,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Tooth Filling',
                'description' => 'Resin composite filling for cavities',
                'price' => 2000,
                'category_name' => 'Restorative',
                'is_excluded_from_analytics' => false,
                'estimated_minutes' => 45,
                'is_special' => false,
                'per_teeth_service' => true,
                'per_tooth_minutes' => 20,
                'special_start_date' => null,
                'special_end_date' => null,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Root Canal Treatment',
                'description' => 'Endodontic treatment to save infected tooth',
                'price' => 8000,
                'category_name' => 'Restorative',
                'is_excluded_from_analytics' => false,
                'estimated_minutes' => 120,
                'is_special' => false,
                'per_teeth_service' => true,
                'per_tooth_minutes' => 30,
                'special_start_date' => null,
                'special_end_date' => null,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Crown Placement',
                'description' => 'Dental crown restoration for damaged tooth',
                'price' => 12000,
                'category_name' => 'Restorative',
                'is_excluded_from_analytics' => false,
                'estimated_minutes' => 90,
                'is_special' => false,
                'per_teeth_service' => true,
                'per_tooth_minutes' => 25,
                'special_start_date' => null,
                'special_end_date' => null,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Whitening + Cleaning Package',
                'description' => 'Limited-time package: Cleaning plus teeth whitening',
                'price' => 4500,
                'category_name' => 'Cosmetic',
                'is_excluded_from_analytics' => true,
                'estimated_minutes' => 90,
                'is_special' => true,
                'per_teeth_service' => false,
                'per_tooth_minutes' => null,
                'special_start_date' => now()->subDays(2)->toDateString(),
                'special_end_date' => now()->addDays(5)->toDateString(),
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
            [
                'name' => 'Orthodontic Consultation',
                'description' => 'Initial consultation for braces and alignment',
                'price' => 1500,
                'category_name' => 'Orthodontic',
                'is_excluded_from_analytics' => true,
                'estimated_minutes' => 30,
                'is_special' => false,
                'per_teeth_service' => false,
                'per_tooth_minutes' => null,
                'special_start_date' => null,
                'special_end_date' => null,
                'is_active' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ],
        ];

        // Transform services to use service_category_id
        $servicesWithCategoryIds = collect($services)->map(function ($service) use ($categories) {
            $categoryName = $service['category_name'];
            unset($service['category_name']); // Remove the temporary category_name field
            
            $category = $categories->get($categoryName);
            if ($category) {
                $service['service_category_id'] = $category->id;
            }
            
            return $service;
        })->toArray();

        Service::insert($servicesWithCategoryIds);
    }
}
