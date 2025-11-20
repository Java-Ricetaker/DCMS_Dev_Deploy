<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('patient_feedbacks', function (Blueprint $table) {
            $table->id();
            $table->foreignId('patient_id')->constrained()->cascadeOnDelete();
            $table->foreignId('patient_visit_id')->constrained('patient_visits')->cascadeOnDelete();
            $table->foreignId('service_id')->nullable()->constrained('services')->nullOnDelete();
            $table->foreignId('dentist_schedule_id')->nullable()->constrained('dentist_schedules')->nullOnDelete();
            $table->json('retention_responses')->nullable();
            $table->unsignedTinyInteger('dentist_rating')->nullable();
            $table->text('dentist_issue_note')->nullable();
            $table->decimal('retention_score_avg', 5, 2)->nullable();
            $table->timestamp('submitted_at')->nullable();
            $table->timestamp('last_edited_at')->nullable();
            $table->timestamp('editable_until')->nullable();
            $table->timestamp('locked_at')->nullable();
            $table->string('locked_reason')->nullable();
            $table->timestamps();

            $table->unique('patient_visit_id');
            $table->index('patient_id');
            $table->index('service_id');
            $table->index('dentist_schedule_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('patient_feedbacks');
    }
};


