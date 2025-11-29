<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('dentist_schedules', function (Blueprint $table) {
            // Monday
            $table->time('mon_start_time')->nullable()->after('mon');
            $table->time('mon_end_time')->nullable()->after('mon_start_time');
            
            // Tuesday
            $table->time('tue_start_time')->nullable()->after('tue');
            $table->time('tue_end_time')->nullable()->after('tue_start_time');
            
            // Wednesday
            $table->time('wed_start_time')->nullable()->after('wed');
            $table->time('wed_end_time')->nullable()->after('wed_start_time');
            
            // Thursday
            $table->time('thu_start_time')->nullable()->after('thu');
            $table->time('thu_end_time')->nullable()->after('thu_start_time');
            
            // Friday
            $table->time('fri_start_time')->nullable()->after('fri');
            $table->time('fri_end_time')->nullable()->after('fri_start_time');
            
            // Saturday
            $table->time('sat_start_time')->nullable()->after('sat');
            $table->time('sat_end_time')->nullable()->after('sat_start_time');
            
            // Sunday
            $table->time('sun_start_time')->nullable()->after('sun');
            $table->time('sun_end_time')->nullable()->after('sun_start_time');
        });
    }

    public function down(): void
    {
        Schema::table('dentist_schedules', function (Blueprint $table) {
            $table->dropColumn([
                'mon_start_time', 'mon_end_time',
                'tue_start_time', 'tue_end_time',
                'wed_start_time', 'wed_end_time',
                'thu_start_time', 'thu_end_time',
                'fri_start_time', 'fri_end_time',
                'sat_start_time', 'sat_end_time',
                'sun_start_time', 'sun_end_time',
            ]);
        });
    }
};

