<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->boolean('is_follow_up')->default(false)->after('per_tooth_minutes');
            $table->foreignId('follow_up_parent_service_id')
                ->nullable()
                ->after('is_follow_up')
                ->constrained('services')
                ->cascadeOnUpdate()
                ->nullOnDelete();
            $table->unsignedTinyInteger('follow_up_max_gap_weeks')
                ->nullable()
                ->after('follow_up_parent_service_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('services', function (Blueprint $table) {
            $table->dropColumn('follow_up_max_gap_weeks');

            $table->dropForeign(['follow_up_parent_service_id']);
            $table->dropColumn('follow_up_parent_service_id');

            $table->dropColumn('is_follow_up');
        });
    }
};

