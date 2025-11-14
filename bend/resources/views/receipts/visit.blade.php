<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Receipt - {{ $receipt_number }}</title>
    <style>
        body {
            font-family: 'DejaVu Sans', Arial, sans-serif;
            margin: 0;
            padding: 20px;
            color: #333;
            font-size: 12px;
        }
        .header {
            display: flex;
            align-items: center;
            justify-content: center;
            border-bottom: 3px solid #0077be;
            padding-bottom: 15px;
            margin-bottom: 25px;
            gap: 12px;
        }
        .header-logo {
            width: 40px;
            height: 40px;
            object-fit: contain;
        }
        .header-content {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
        }
        .header h1 {
            color: #3c3c3c;
            margin: 0;
            font-size: 20px;
            font-weight: bold;
        }
        .header p {
            color: #666;
            margin: 5px 0 0 0;
            font-size: 14px;
        }
        .receipt-info {
            display: flex;
            justify-content: space-between;
            margin-bottom: 25px;
        }
        .receipt-details, .clinic-details {
            width: 48%;
        }
        .section-title {
            font-size: 14px;
            font-weight: bold;
            color: #0077be;
            margin-bottom: 10px;
            border-bottom: 1px solid #ddd;
            padding-bottom: 5px;
        }
        .info-row {
            display: flex;
            justify-content: space-between;
            margin: 5px 0;
            padding: 3px 0;
        }
        .info-label {
            font-weight: bold;
            color: #555;
        }
        .info-value {
            color: #333;
        }
        .patient-section {
            margin-bottom: 25px;
        }
        .service-section {
            margin-bottom: 25px;
        }
        .service-details {
            background-color: #f8f9fa;
            padding: 15px;
            border-radius: 5px;
            border-left: 4px solid #0077be;
        }
        .payment-section {
            margin-bottom: 25px;
        }
        .payment-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 10px;
        }
        .payment-table th,
        .payment-table td {
            border: 1px solid #ddd;
            padding: 8px;
            text-align: left;
        }
        .payment-table th {
            background-color: #f8f9fa;
            font-weight: bold;
            color: #0077be;
        }
        .total-row {
            background-color: #e3f2fd;
            font-weight: bold;
        }
        .amount {
            font-size: 16px;
            font-weight: bold;
            color: #28a745;
        }
        .footer {
            text-align: center;
            margin-top: 30px;
            padding-top: 15px;
            border-top: 1px solid #ddd;
            color: #666;
            font-size: 10px;
        }
        .notes-section {
            margin-top: 20px;
            padding: 10px;
            background-color: #fff3cd;
            border: 1px solid #ffeaa7;
            border-radius: 5px;
        }
        .notes-section h4 {
            margin: 0 0 10px 0;
            color: #856404;
        }
        .visit-duration {
            background-color: #d4edda;
            padding: 10px;
            border-radius: 5px;
            border-left: 4px solid #28a745;
            margin: 10px 0;
        }
    </style>
</head>
<body>
    <div class="header">
        <img src="{{ base_path('public/logo.png') }}" alt="Kreative Dental Logo" class="header-logo" />
        <div class="header-content">
            <h1>{{ $clinic_name }}</h1>
            <p>Visit Receipt</p>
        </div>
    </div>
    
    <div class="receipt-info">
        <div class="receipt-details">
            <div class="section-title">Receipt Information</div>
            <div class="info-row">
                <span class="info-label">Receipt No:</span>
                <span class="info-value">{{ $receipt_number }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Date:</span>
                <span class="info-value">{{ $receipt_date }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Time:</span>
                <span class="info-value">{{ $receipt_time }}</span>
            </div>
        </div>
        
        <div class="clinic-details">
            <div class="section-title">Clinic Information</div>
            <div class="info-row">
                <span class="info-label">Address:</span>
                <span class="info-value">{{ $clinic_address }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Phone:</span>
                <span class="info-value">{{ $clinic_phone }}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Email:</span>
                <span class="info-value">{{ $clinic_email }}</span>
            </div>
        </div>
    </div>
    
    <div class="patient-section">
        <div class="section-title">Patient Information</div>
        <div class="info-row">
            <span class="info-label">Name:</span>
            <span class="info-value">{{ $patient_name }}</span>
        </div>
        @if($patient_email)
        <div class="info-row">
            <span class="info-label">Email:</span>
            <span class="info-value">{{ $patient_email }}</span>
        </div>
        @endif
        @if($patient_phone)
        <div class="info-row">
            <span class="info-label">Phone:</span>
            <span class="info-value">{{ $patient_phone }}</span>
        </div>
        @endif
        @if($patient_address)
        <div class="info-row">
            <span class="info-label">Address:</span>
            <span class="info-value">{{ $patient_address }}</span>
        </div>
        @endif
    </div>
    
    <div class="service-section">
        <div class="section-title">Visit Details</div>
        <div class="service-details">
            <div class="info-row">
                <span class="info-label">Service:</span>
                <span class="info-value">{{ $service_name }}</span>
            </div>
            @if($service_description)
            <div class="info-row">
                <span class="info-label">Description:</span>
                <span class="info-value">{{ $service_description }}</span>
            </div>
            @endif
            <div class="info-row">
                <span class="info-label">Visit Date:</span>
                <span class="info-value">{{ $visit_date }}</span>
            </div>
            @if($start_time && $end_time)
            <div class="visit-duration">
                <div class="info-row">
                    <span class="info-label">Start Time:</span>
                    <span class="info-value">{{ $start_time }}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">End Time:</span>
                    <span class="info-value">{{ $end_time }}</span>
                </div>
            </div>
            @endif
            @if($teeth_treated)
            <div class="info-row">
                <span class="info-label">Teeth Treated:</span>
                <span class="info-value">{{ $teeth_treated }}</span>
            </div>
            @endif
            <div class="info-row">
                <span class="info-label">Status:</span>
                <span class="info-value">{{ $visit_status }}</span>
            </div>
        </div>
    </div>
    
    @if(isset($additional_charges) && $additional_charges->count() > 0)
    <div class="payment-section">
        <div class="section-title">Additional Items</div>
        <table class="payment-table">
            <thead>
                <tr>
                    <th>Item</th>
                    <th>Quantity</th>
                    <th>Unit Price</th>
                    <th>Total</th>
                </tr>
            </thead>
            <tbody>
                @foreach($additional_charges as $charge)
                <tr>
                    <td>{{ $charge['item_name'] }}</td>
                    <td>{{ $charge['quantity'] }}</td>
                    <td>₱{{ number_format($charge['unit_price'], 2) }}</td>
                    <td>₱{{ number_format($charge['total_price'], 2) }}</td>
                </tr>
                @endforeach
                <tr class="total-row">
                    <td colspan="3"><strong>Additional Charges Subtotal</strong></td>
                    <td class="amount">₱{{ number_format($additional_charges_total, 2) }}</td>
                </tr>
            </tbody>
        </table>
    </div>
    @endif
    
    <div class="payment-section">
        <div class="section-title">Payment Information</div>
        <table class="payment-table">
            <thead>
                <tr>
                    <th>Payment Method</th>
                    <th>Reference</th>
                    <th>Amount</th>
                    <th>Date Paid</th>
                    <th>Status</th>
                </tr>
            </thead>
            <tbody>
                @forelse($payment_details as $payment)
                <tr>
                    <td>{{ $payment['method'] }}</td>
                    <td>{{ $payment['reference'] }}</td>
                    <td>₱{{ number_format($payment['amount'], 2) }}</td>
                    <td>{{ $payment['paid_at'] ?? 'N/A' }}</td>
                    <td>{{ ucfirst($payment['status']) }}</td>
                </tr>
                @empty
                <tr>
                    <td colspan="5" style="text-align: center;">No payment records found</td>
                </tr>
                @endforelse
                @if(isset($service_amount))
                <tr class="total-row">
                    <td colspan="2"><strong>Service Amount</strong></td>
                    <td class="amount">₱{{ number_format($service_amount, 2) }}</td>
                    <td colspan="2"></td>
                </tr>
                @endif
                @if(isset($additional_charges_total) && $additional_charges_total > 0)
                <tr class="total-row">
                    <td colspan="2"><strong>Additional Charges</strong></td>
                    <td class="amount">₱{{ number_format($additional_charges_total, 2) }}</td>
                    <td colspan="2"></td>
                </tr>
                @endif
                <tr class="total-row">
                    <td colspan="2"><strong>Total Amount</strong></td>
                    <td class="amount">₱{{ number_format($total_amount, 2) }}</td>
                    <td colspan="2"></td>
                </tr>
                <tr class="total-row">
                    <td colspan="2"><strong>Total Paid</strong></td>
                    <td class="amount">₱{{ number_format($total_paid, 2) }}</td>
                    <td colspan="2"></td>
                </tr>
            </tbody>
        </table>
    </div>
    
    @if($has_notes)
    <div class="notes-section">
        <h4>Treatment Notes</h4>
        <p>Detailed treatment notes and findings are available in your patient record. Please contact the clinic if you need a copy of your treatment notes.</p>
    </div>
    @endif
    
    <div class="footer">
        <p><strong>Thank you for choosing Kreative Dental & Orthodontics!</strong></p>
        <p>Please keep this receipt for your records.</p>
        <p>For inquiries, please contact us at {{ $clinic_phone }} or {{ $clinic_email }}</p>
        <p>Generated on {{ $receipt_date }} at {{ $receipt_time }}</p>
    </div>
</body>
</html>
