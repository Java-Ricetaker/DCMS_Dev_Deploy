<?php

namespace Database\Factories;

use App\Models\Service;
use Illuminate\Database\Eloquent\Factories\Factory;

/**
 * @extends \Illuminate\Database\Eloquent\Factories\Factory<\App\Models\Service>
 */
class ServiceFactory extends Factory
{
    protected $model = Service::class;

    /**
     * Define the model's default state.
     *
     * @return array<string, mixed>
     */
    public function definition(): array
    {
        return [
            'name' => $this->faker->words(3, true) . ' Service',
            'description' => $this->faker->sentence(),
            'price' => $this->faker->randomFloat(2, 100, 5000),
            'estimated_minutes' => $this->faker->numberBetween(30, 180),
            'is_active' => true,
            'is_follow_up' => false,
            'follow_up_parent_service_id' => null,
            'follow_up_max_gap_weeks' => null,
        ];
    }
}
