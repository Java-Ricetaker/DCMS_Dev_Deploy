<?php

namespace App\Models;

use App\Models\ServiceBundleItem;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class Service extends Model
{
    use HasFactory;
    protected $fillable = [
        'name',
        'description',
        'price',
        'service_category_id',
        'is_excluded_from_analytics',
        'is_special',
        'special_start_date',
        'special_end_date',
        'estimated_minutes',
        'per_teeth_service',
        'per_tooth_minutes',
        'is_follow_up',
        'follow_up_parent_service_id',
        'follow_up_max_gap_weeks',
    ];

    protected $casts = [
        'is_follow_up' => 'boolean',
        'follow_up_max_gap_weeks' => 'integer',
    ];

    public function discounts()
    {
        return $this->hasMany(ServiceDiscount::class);
    }

    public function category()
    {
        return $this->belongsTo(ServiceCategory::class, 'service_category_id');
    }

    public function getPriceForDate($date)
    {
        $discount = $this->discounts()
            ->where('start_date', '<=', $date)
            ->where('end_date', '>=', $date)
            ->where('status', 'launched')
            ->whereDate('activated_at', '<=', now()->subDay()->toDateString()) // must be activated for at least 1 day
            ->first();

        return $discount ? $discount->discounted_price : $this->price;
    }

    public function isCurrentlyActiveSpecial(): bool
    {
        if (!$this->is_special)
            return false;

        $today = now()->toDateString();

        return $this->special_start_date <= $today && $this->special_end_date >= $today;
    }

    public function bundleItems()
    {
        return $this->hasMany(ServiceBundleItem::class, 'parent_service_id');
    }

    public function bundledServices()
    {
        return $this->belongsToMany(Service::class, 'service_bundle_items', 'parent_service_id', 'child_service_id');
    }

    // Add this method to get services that are part of packages
    public function parentPackages()
    {
        return $this->belongsToMany(Service::class, 'service_bundle_items', 'child_service_id', 'parent_service_id');
    }

    public function followUpParent()
    {
        return $this->belongsTo(Service::class, 'follow_up_parent_service_id');
    }

    public function followUpChildren()
    {
        return $this->hasMany(Service::class, 'follow_up_parent_service_id');
    }

    // Helper method to check if this service can be marked as per-teeth
    public function canBePerTeethService(): bool
    {
        return !$this->is_special;
    }

    // Helper method to get formatted teeth treated string
    public static function formatTeethTreated($teethString): string
    {
        if (empty($teethString)) {
            return '';
        }
        
        // Remove spaces and split by comma
        $teeth = array_map('trim', explode(',', $teethString));
        $teeth = array_filter($teeth); // Remove empty values
        
        return implode(', ', $teeth);
    }

    // Helper method to sanitize teeth treated input
    public static function sanitizeTeethTreated($teethString): string
    {
        if (empty($teethString)) {
            return '';
        }
        
        // Remove spaces and split by comma
        $teeth = array_map('trim', explode(',', $teethString));
        $teeth = array_filter($teeth); // Remove empty values
        
        return implode(',', $teeth);
    }

    // Helper method to count teeth from teeth treated string
    public static function countTeeth($teethString): int
    {
        if (empty($teethString)) {
            return 0;
        }
        
        $teeth = array_map('trim', explode(',', $teethString));
        $teeth = array_filter($teeth); // Remove empty values
        
        return count($teeth);
    }

    // Helper method to determine if teeth are primary (letters) or adult (numbers)
    public static function isPrimaryTeeth($teethString): bool
    {
        if (empty($teethString)) {
            return false;
        }
        
        $teeth = array_map('trim', explode(',', $teethString));
        $teeth = array_filter($teeth); // Remove empty values
        
        // Check if any tooth is a letter (A-T for primary teeth)
        foreach ($teeth as $tooth) {
            if (preg_match('/^[A-T]$/', $tooth)) {
                return true;
            }
        }
        
        return false;
    }

    // Helper method to get teeth type description
    public static function getTeethTypeDescription($teethString): string
    {
        if (empty($teethString)) {
            return '';
        }
        
        return self::isPrimaryTeeth($teethString) ? 'Primary Teeth' : 'Adult Teeth';
    }

    // Helper method to validate teeth format
    public static function validateTeethFormat($teethString): array
    {
        $errors = [];
        
        if (empty($teethString)) {
            return $errors;
        }
        
        $teeth = array_map('trim', explode(',', $teethString));
        $teeth = array_filter($teeth); // Remove empty values
        
        $hasNumbers = false;
        $hasLetters = false;
        
        foreach ($teeth as $tooth) {
            if (preg_match('/^[1-9]|[1-2][0-9]|3[0-2]$/', $tooth)) {
                // Adult teeth: 1-32
                $hasNumbers = true;
            } elseif (preg_match('/^[A-T]$/', $tooth)) {
                // Primary teeth: A-T
                $hasLetters = true;
            } else {
                $errors[] = "Invalid tooth identifier: {$tooth}. Use numbers 1-32 for adult teeth or letters A-T for primary teeth.";
            }
        }
        
        if ($hasNumbers && $hasLetters) {
            $errors[] = "Cannot mix adult teeth (numbers 1-32) and primary teeth (letters A-T) in the same entry.";
        }
        
        return $errors;
    }

    // Method to calculate total price for per-teeth services
    public function calculateTotalPrice($teethTreated = null): float
    {
        if (!$this->per_teeth_service) {
            return $this->price;
        }

        if ($teethTreated === null) {
            return $this->price; // Return per-tooth price if no teeth specified
        }

        $teethCount = self::countTeeth($teethTreated);
        return $this->price * $teethCount;
    }

    // Method to get display price for per-teeth services
    public function getDisplayPrice(): string
    {
        if ($this->per_teeth_service) {
            return '₱' . number_format($this->price, 2) . ' per tooth';
        }
        
        return '₱' . number_format($this->price, 2);
    }

    // Method to check if service allows discounted pricing (for packages/promos)
    public function allowsDiscountedPricing(): bool
    {
        return $this->is_special; // Special/package services can have discounted pricing
    }

    // Method to calculate estimated minutes for per-teeth services
    public function calculateEstimatedMinutes($teethCount = null): int
    {
        if (!$this->per_teeth_service || !$this->per_tooth_minutes) {
            return $this->estimated_minutes;
        }

        if ($teethCount === null || $teethCount <= 0) {
            return $this->per_tooth_minutes; // Return per-tooth time for single tooth
        }

        $totalMinutes = $this->per_tooth_minutes * $teethCount;
        
        // Round up to nearest 30 minutes
        return (int) ceil($totalMinutes / 30) * 30;
    }

    // Method to get display time for per-teeth services
    public function getDisplayTime(): string
    {
        if ($this->per_teeth_service && $this->per_tooth_minutes) {
            return "{$this->per_tooth_minutes} mins per tooth";
        }
        
        return "{$this->estimated_minutes} mins";
    }
}
