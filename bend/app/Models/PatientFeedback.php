<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use App\Support\PatientFeedbackRules;

class PatientFeedback extends Model
{
    use HasFactory;

    protected $table = 'patient_feedbacks';

    protected $fillable = [
        'patient_id',
        'patient_visit_id',
        'service_id',
        'dentist_schedule_id',
        'retention_responses',
        'dentist_rating',
        'dentist_issue_note',
        'retention_score_avg',
        'submitted_at',
        'last_edited_at',
        'editable_until',
        'locked_at',
        'locked_reason',
    ];

    protected $casts = [
        'retention_responses' => 'array',
        'submitted_at' => 'datetime',
        'last_edited_at' => 'datetime',
        'editable_until' => 'datetime',
        'locked_at' => 'datetime',
        'retention_score_avg' => 'decimal:2',
    ];

    public function patient()
    {
        return $this->belongsTo(Patient::class);
    }

    public function visit()
    {
        return $this->belongsTo(PatientVisit::class, 'patient_visit_id');
    }

    public function service()
    {
        return $this->belongsTo(Service::class);
    }

    public function dentistSchedule()
    {
        return $this->belongsTo(DentistSchedule::class);
    }

    /**
     * Determine if the feedback is still editable based on timestamps.
     */
    public function isEditable(): bool
    {
        return PatientFeedbackRules::feedbackEditable($this);
    }
}

