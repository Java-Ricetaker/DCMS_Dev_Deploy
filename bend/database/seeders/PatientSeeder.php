<?php

namespace Database\Seeders;

use App\Models\User;
use App\Models\Patient;
use Illuminate\Database\Seeder;

class PatientSeeder extends Seeder
{
    /**
     * Run the database seeds.
     */
    public function run(): void
    {
        \DB::statement('SET FOREIGN_KEY_CHECKS=0;');
        Patient::truncate();
        \DB::statement('SET FOREIGN_KEY_CHECKS=1;');

        $juan = User::where('email', 'juan.patient@gmail.com')->first();
        $maria = User::where('email', 'maria.patient@gmail.com')->first();

        Patient::create([
            'user_id' => $juan->id,
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'middle_name' => 'Santos',
            'birthdate' => '2000-01-15',
            'sex' => 'male',
            'contact_number' => '09171234567',
            'address' => 'Cabuyao, Laguna',
            'is_linked' => true,
        ]);

        Patient::create([
            'user_id' => $maria->id,
            'first_name' => 'Maria',
            'last_name' => 'Reyes',
            'middle_name' => null,
            'birthdate' => '1999-07-22',
            'sex' => 'female',
            'contact_number' => '09179876543',
            'address' => 'Santa Rosa, Laguna',
            'is_linked' => true,
            'archived_at' => now()->subYears(6),
            'archived_reason' => 'No activity in 5+ years (seeded)',
        ]);
    }
}
