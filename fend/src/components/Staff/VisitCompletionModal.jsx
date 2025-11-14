import { useState, useEffect } from "react";
import api from "../../api/api";
import toast from "react-hot-toast";

export default function VisitCompletionModal({ visit, onClose, onComplete }) {
  const [step, setStep] = useState(1); // 1: Stock, 2: Notes, 3: Payment
  const [inventoryItems, setInventoryItems] = useState([]);
  const [stockItems, setStockItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Billable items for additional charges
  const [billableItems, setBillableItems] = useState([]);

  // Step 2: Notes
  const [dentistNotes, setDentistNotes] = useState("");
  const [findings, setFindings] = useState("");
  const [treatmentPlan, setTreatmentPlan] = useState("");
  const [teethTreated, setTeethTreated] = useState("");
  const [originalNotesInfo, setOriginalNotesInfo] = useState(null);
  const [showNoStockWarning, setShowNoStockWarning] = useState(false);
  const [pendingPayload, setPendingPayload] = useState(null);
  const [warningAcknowledged, setWarningAcknowledged] = useState(false);

  // Step 3: Payment
  const [paymentStatus, setPaymentStatus] = useState("paid");
  const [onsitePaymentAmount, setOnsitePaymentAmount] = useState("");
  const [paymentMethodChange, setPaymentMethodChange] = useState("");

  useEffect(() => {
    fetchInventoryItems();
    fetchDentistNotes();
  }, []);

  const fetchInventoryItems = async () => {
    try {
      const res = await api.get("/api/inventory/items");
      setInventoryItems(res.data.data || []);
    } catch (err) {
      console.error("Failed to load inventory items", err);
    }
  };

  const fetchDentistNotes = async () => {
    try {
      const res = await api.get(`/api/visits/${visit.id}/dentist-notes`);
      const notes = res.data;
      
      // Pre-fill the form with dentist notes if they exist
      if (notes.dentist_notes) setDentistNotes(notes.dentist_notes);
      if (notes.findings) setFindings(notes.findings);
      if (notes.treatment_plan) setTreatmentPlan(notes.treatment_plan);
      if (notes.teeth_treated) setTeethTreated(notes.teeth_treated);
      
      // Store original notes info for display
      if (notes.created_by || notes.created_at) {
        setOriginalNotesInfo({
          created_by: notes.created_by,
          created_at: notes.created_at,
          updated_by: notes.updated_by,
          updated_at: notes.updated_at,
        });
      }
    } catch (err) {
      // No notes found or error - that's okay, form will start empty
      console.log("No dentist notes found or error fetching notes:", err?.response?.data?.message);
    }
  };

  const addStockItem = () => {
    setStockItems([...stockItems, { item_id: "", quantity: "", notes: "" }]);
  };

  const updateStockItem = (index, field, value) => {
    const updated = [...stockItems];
    updated[index][field] = value;
    setStockItems(updated);
  };

  const removeStockItem = (index) => {
    setStockItems(stockItems.filter((_, i) => i !== index));
  };

  const toggleBillableItem = (itemId, item) => {
    const isAlreadySelected = billableItems.some(bi => bi.item_id === itemId);
    if (isAlreadySelected) {
      setBillableItems(billableItems.filter(bi => bi.item_id !== itemId));
    } else {
      setBillableItems([...billableItems, { 
        item_id: itemId, 
        quantity: 1, 
        unit_price: Number(item.patient_price) || 0
      }]);
    }
  };

  const updateBillableItemQuantity = (itemId, quantity) => {
    setBillableItems(billableItems.map(bi => 
      bi.item_id === itemId ? { ...bi, quantity: Math.max(1, Number(quantity) || 1) } : bi
    ));
  };

  const calculatePaymentStatus = () => {
    const totalPaid = visit.payments?.reduce((sum, p) => sum + (p.amount_paid || 0), 0) || 0;
    const servicePrice = visit.service?.price || 0;
    
    if (totalPaid >= servicePrice) return "paid";
    if (totalPaid > 0) return "partial";
    return "unpaid";
  };

  const handleComplete = async () => {
    const normalizedStockItems = stockItems.filter(item => item.item_id && item.quantity);

    const payload = {
      stock_items: normalizedStockItems,
      billable_items: billableItems.map(item => ({
        item_id: item.item_id,
        quantity: Number(item.quantity) || 1,
        unit_price: Number(item.unit_price) || 0
      })),
      dentist_notes: dentistNotes,
      findings: findings,
      treatment_plan: treatmentPlan,
      teeth_treated: teethTreated,
      payment_status: isMayaPaymentCompleted ? "paid" : paymentStatus,
      onsite_payment_amount: isMayaPaymentCompleted ? null : (onsitePaymentAmount ? Number(onsitePaymentAmount) : null),
      payment_method_change: isMayaPaymentCompleted ? null : (paymentMethodChange || null),
    };

    if (normalizedStockItems.length === 0 && !warningAcknowledged) {
      setPendingPayload(payload);
      setShowNoStockWarning(true);
      return;
    }

    await submitCompletion(payload);
  };

  const submitCompletion = async (payload) => {
    setSubmitting(true);
    try {
      await api.post(`/api/visits/${visit.id}/complete-with-details`, payload);

      // Automatically send receipt email if patient is linked to a user account
      try {
        const emailResponse = await api.post(`/api/receipts/visit/${visit.id}/email`, {}, {
          skip401Handler: true
        });

        if (emailResponse.data.note) {
          // Email was skipped (likely seeded data)
          toast.success(`Visit completed successfully!\n\n${emailResponse.data.message}\n\n${emailResponse.data.note}`);
        } else {
          // Email was sent successfully
          toast.success(`Visit completed successfully!\n\nReceipt sent to: ${emailResponse.data.email}`);
        }
      } catch (emailErr) {
        // Email sending failed, but visit completion was successful
        console.error("Failed to send receipt email:", emailErr);
        toast.success(`Visit completed successfully!\n\nNote: Receipt email could not be sent. Patient can download receipt from their appointments page.`);
      }

      onComplete();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to complete visit");
    } finally {
      setPendingPayload(null);
      setWarningAcknowledged(false);
      setSubmitting(false);
    }
  };

  const totalPaid = visit.payments?.reduce((sum, p) => sum + (Number(p.amount_paid) || 0), 0) || 0;
  const servicePrice = Number(visit.service?.price) || 0;
  const isPerToothService = Boolean(visit.service?.per_teeth_service);
  const additionalChargesTotal = billableItems.reduce((sum, item) => {
    const unitPrice = Number(item.unit_price) || 0;
    const quantity = Number(item.quantity) || 1;
    return sum + (unitPrice * quantity);
  }, 0);
  const totalPrice = servicePrice + additionalChargesTotal;
  const balance = totalPrice - totalPaid;
  
  // Check if there's a paid Maya payment
  const paidMayaPayment = visit.payments?.find(p => p.method === 'maya' && p.status === 'paid');
  const isMayaPaymentCompleted = !!paidMayaPayment;

  return (
    <>
      <div className="modal fade show d-block" style={{
        backgroundColor: 'rgba(0,0,0,0.5)',
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 1050,
        overflowY: "auto",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem"
      }} tabIndex="-1" role="dialog">
        <div className="modal-dialog modal-lg" role="document" style={{
          maxWidth: '800px', 
          maxHeight: 'calc(100vh - 2rem)',
          margin: "0 auto",
          width: "100%"
        }}>
          <div className="modal-content d-flex flex-column" style={{
            maxHeight: 'calc(100vh - 2rem)',
            overflow: "hidden"
          }}>
            <div className="modal-header bg-primary text-white py-2 flex-shrink-0" style={{
              position: "sticky",
              top: 0,
              zIndex: 1,
              borderBottom: "1px solid #dee2e6"
            }}>
              <h5 className="modal-title fw-bold mb-0">
                <i className="fas fa-check-circle me-2"></i>
                Complete Visit
              </h5>
              <button 
                type="button" 
                className="btn-close btn-close-white" 
                onClick={onClose}
                aria-label="Close"
                style={{fontSize: '1.2rem'}}
              ></button>
            </div>
            <div className="modal-body p-3 flex-grow-1" style={{
              overflowY: "auto",
              overflowX: "hidden",
              flex: "1 1 auto",
              minHeight: 0
            }}>

              {/* Progress Steps */}
              <div className="d-flex justify-content-center mb-3">
                <div className="progress w-100" style={{height: '4px'}}>
                  <div 
                    className="progress-bar bg-primary" 
                    role="progressbar" 
                    style={{width: `${(step / 3) * 100}%`}}
                    aria-valuenow={step} 
                    aria-valuemin="0" 
                    aria-valuemax="3"
                  ></div>
                </div>
              </div>
              
              <div className="d-flex justify-content-between mb-3">
                {[1, 2, 3].map((stepNum) => (
                  <div key={stepNum} className="d-flex flex-column align-items-center">
                    <div
                      className={`rounded-circle d-flex align-items-center justify-content-center mb-1 ${
                        step >= stepNum
                          ? "bg-primary text-white shadow-sm"
                          : "bg-light text-muted border"
                      }`}
                      style={{width: '36px', height: '36px', fontSize: '14px'}}
                    >
                      <i className={`fas ${
                        stepNum === 1 ? "fa-boxes" : 
                        stepNum === 2 ? "fa-sticky-note" : 
                        "fa-credit-card"
                      }`}></i>
                    </div>
                    <small className={`text-center ${step >= stepNum ? "text-primary fw-bold" : "text-muted"}`} style={{fontSize: '12px'}}>
                      {stepNum === 1 && "Stock"}
                      {stepNum === 2 && "Notes"}
                      {stepNum === 3 && "Payment"}
                    </small>
                  </div>
                ))}
              </div>

              {/* Step 1: Stock Consumption */}
              {step === 1 && (
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-gradient bg-light py-2">
                    <h6 className="card-title mb-0">
                      <i className="fas fa-boxes text-primary me-2"></i>
                      Consume Stock Items
                    </h6>
                  </div>
                  <div className="card-body p-3">
                    {stockItems.length > 0 ? (
                      <div className="row g-2">
                        {stockItems.map((item, index) => (
                          <div key={index} className="col-12">
                            <div className="card border border-primary border-opacity-25">
                              <div className="card-body p-2">
                                <div className="row g-2 align-items-end">
                                  <div className="col-md-4">
                                    <select
                                      className="form-select"
                                      value={item.item_id}
                                      onChange={(e) => updateStockItem(index, "item_id", e.target.value)}
                                    >
                                      <option value="">Item</option>
                                      {inventoryItems.map((invItem) => (
                                        <option key={invItem.id} value={invItem.id}>
                                          {invItem.name} (Stock: {invItem.total_on_hand || 0})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                  <div className="col-md-2">
                                    <input
                                      type="number"
                                      step="1"
                                      min="0"
                                      className="form-control"
                                      value={item.quantity}
                                      onChange={(e) => updateStockItem(index, "quantity", e.target.value)}
                                      placeholder="Quantity"
                                    />
                                  </div>
                                  <div className="col-md-4">
                                    <input
                                      type="text"
                                      className="form-control"
                                      value={item.notes}
                                      onChange={(e) => updateStockItem(index, "notes", e.target.value)}
                                      placeholder="Notes"
                                    />
                                  </div>
                                  <div className="col-md-2">
                                    <button
                                      type="button"
                                      onClick={() => removeStockItem(index)}
                                      className="btn btn-outline-danger w-100"
                                      title="Remove item"
                                      style={{minHeight: '38px'}}
                                    >
                                      <i className="fas fa-trash me-1"></i>
                                      Remove Item
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-muted">
                        <i className="fas fa-boxes fa-3x mb-3 text-primary opacity-50"></i>
                        <p className="mb-0">No stock items added yet</p>
                        <small>Click "Add Item" to start consuming stock</small>
                      </div>
                    )}
                    <div className="mt-3 text-center">
                      <button
                        type="button"
                        onClick={addStockItem}
                        className="btn btn-primary"
                        style={{minWidth: '120px'}}
                      >
                        <i className="fas fa-plus me-2"></i>
                        Add Item
                      </button>
                    </div>

                    {/* Billable Items Section */}
                    <hr className="my-4" />
                    <div className="alert alert-info py-2 mb-3">
                      <i className="fas fa-info-circle me-2"></i>
                      <strong>Additional Items:</strong> Select items that patients can purchase separately (not included in procedure)
                    </div>
                    
                    <div className="card border-warning">
                      <div className="card-body p-2">
                        <div className="row">
                          {inventoryItems.filter(item => item.is_sellable && item.patient_price).map((item) => (
                            <div key={item.id} className="col-12 mb-2">
                              <div className="form-check">
                                <input
                                  className="form-check-input"
                                  type="checkbox"
                                  checked={billableItems.some(bi => bi.item_id === item.id)}
                                  onChange={() => toggleBillableItem(item.id, item)}
                                  id={`billable-${item.id}`}
                                />
                                <label className="form-check-label" htmlFor={`billable-${item.id}`}>
                                  {item.name} - ₱{Number(item.patient_price).toLocaleString()}
                                </label>
                              </div>
                              {billableItems.some(bi => bi.item_id === item.id) && (
                                <div className="ms-4 mt-1">
                                  <div className="input-group input-group-sm" style={{width: '150px'}}>
                                    <span className="input-group-text">Qty:</span>
                                    <input
                                      type="number"
                                      className="form-control"
                                      min="1"
                                      value={billableItems.find(bi => bi.item_id === item.id)?.quantity || 1}
                                      onChange={(e) => updateBillableItemQuantity(item.id, e.target.value)}
                                    />
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                        {inventoryItems.filter(item => item.is_sellable && item.patient_price).length === 0 && (
                          <p className="text-muted mb-0 small">No billable items available. Configure items as sellable in inventory settings.</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 2: Visit Notes */}
              {step === 2 && (
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-gradient bg-light py-2">
                    <h6 className="card-title mb-0">
                      <i className="fas fa-sticky-note text-primary me-2"></i>
                      Visit Documentation
                    </h6>
                  </div>
                  <div className="card-body p-3">
                    {/* Show original notes info if available */}
                    {originalNotesInfo && (
                      <div className="alert alert-info mb-3 py-2 border-0">
                        <h6 className="alert-heading small">
                          <i className="fas fa-info-circle me-2"></i>
                          Original Notes Information
                        </h6>
                        <p className="mb-1 small">
                          <strong>Created by:</strong> {originalNotesInfo.created_by} on {new Date(originalNotesInfo.created_at).toLocaleString()}
                        </p>
                        {originalNotesInfo.updated_by && originalNotesInfo.updated_at && (
                          <p className="mb-1 small">
                            <strong>Last updated by:</strong> {originalNotesInfo.updated_by} on {new Date(originalNotesInfo.updated_at).toLocaleString()}
                          </p>
                        )}
                        <hr className="my-2" />
                        <p className="mb-0 small">
                          You can edit these notes as needed for the final documentation.
                        </p>
                      </div>
                    )}
                    
                    <div className="row g-3">
                      <div className="col-12">
                        <label className="form-label fw-semibold">
                          <i className="fas fa-user-md text-primary me-1"></i>
                          Dentist Notes
                        </label>
                        <textarea
                          className="form-control"
                          rows="3"
                          value={dentistNotes}
                          onChange={(e) => setDentistNotes(e.target.value)}
                          placeholder="Enter dentist's notes about the visit..."
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label fw-semibold">
                          <i className="fas fa-search text-primary me-1"></i>
                          Findings
                        </label>
                        <textarea
                          className="form-control"
                          rows="3"
                          value={findings}
                          onChange={(e) => setFindings(e.target.value)}
                          placeholder="Document any findings or observations..."
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label fw-semibold">
                          <i className="fas fa-clipboard-list text-primary me-1"></i>
                          Treatment Plan
                        </label>
                        <textarea
                          className="form-control"
                          rows="3"
                          value={treatmentPlan}
                          onChange={(e) => setTreatmentPlan(e.target.value)}
                          placeholder="Outline the treatment plan or follow-up instructions..."
                        />
                      </div>
                      <div className="col-12">
                        <label className="form-label fw-semibold">
                          <i className="fas fa-tooth text-primary me-1"></i>
                          Teeth Treated
                        </label>
                        <input
                          type="text"
                          className="form-control"
                          value={teethTreated}
                          onChange={(e) => setTeethTreated(e.target.value)}
                          placeholder="e.g., 1,2,3,4,5 or leave blank if not applicable"
                        />
                        <div className="form-text">
                          Enter tooth numbers separated by commas (e.g., 1,2,3,4,5). Use the Universal Numbering System.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Step 3: Payment Verification */}
              {step === 3 && (
                <div className="card border-0 shadow-sm">
                  <div className="card-header bg-gradient bg-light py-2">
                    <h6 className="card-title mb-0">
                      <i className="fas fa-credit-card text-primary me-2"></i>
                      Payment Verification
                    </h6>
                  </div>
                  <div className="card-body p-3">
                    <div className="row g-3">
                      <div className="col-12">
                        <div className="card border-0 shadow-sm" style={{background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)'}}>
                          <div className="card-body p-3">
                            <h6 className="card-title text-dark mb-3">
                              <i className="fas fa-receipt text-primary me-2"></i>
                              Payment Summary
                            </h6>
                            <div className="row g-3">
                              <div className="col-6">
                                <div className="d-flex flex-column">
                                  <small className="text-muted mb-1">Service</small>
                                  <div className="fw-semibold text-dark">{visit.service?.name || "N/A"}</div>
                                </div>
                              </div>
                              <div className="col-6">
                                <div className="d-flex flex-column">
                                  <small className="text-muted mb-1">Service Price</small>
                                  <div className="fw-semibold text-primary">
                                    ₱{servicePrice.toLocaleString()}
                                    {isPerToothService && (
                                      <small className="text-info d-block">per tooth</small>
                                    )}
                                  </div>
                                </div>
                              </div>
                              {additionalChargesTotal > 0 && (
                                <>
                                  <div className="col-12">
                                    <hr className="my-2" />
                                    <div className="fw-semibold mb-2">Additional Items:</div>
                                    {billableItems.map((item) => {
                                      const invItem = inventoryItems.find(i => i.id === item.item_id);
                                      return (
                                        <div key={item.item_id} className="d-flex justify-content-between mb-1">
                                          <small>{invItem?.name} (x{item.quantity})</small>
                                          <small className="fw-semibold">₱{Number(item.unit_price * item.quantity).toLocaleString()}</small>
                                        </div>
                                      );
                                    })}
                                    <hr className="my-2" />
                                  </div>
                                  <div className="col-6">
                                    <div className="d-flex flex-column">
                                      <small className="text-muted mb-1">Additional Charges</small>
                                      <div className="fw-semibold text-warning">₱{additionalChargesTotal.toLocaleString()}</div>
                                    </div>
                                  </div>
                                  <div className="col-6">
                                    <div className="d-flex flex-column">
                                      <small className="text-muted mb-1">Total Price</small>
                                      <div className="fw-bold text-primary">₱{totalPrice.toLocaleString()}</div>
                                    </div>
                                  </div>
                                </>
                              )}
                              <div className="col-6">
                                <div className="d-flex flex-column">
                                  <small className="text-muted mb-1">Total Paid</small>
                                  <div className="fw-semibold text-success">₱{totalPaid.toLocaleString()}</div>
                                </div>
                              </div>
                              <div className="col-6">
                                <div className="d-flex flex-column">
                                  <small className="text-muted mb-1">Balance</small>
                                  <div className={`fw-bold ${balance > 0 ? 'text-warning' : 'text-success'}`}>
                                    ₱{balance.toLocaleString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Show Maya payment completion info if applicable */}
                      {isMayaPaymentCompleted && (
                        <div className="col-12">
                          <div className="alert alert-success border-0 shadow-sm">
                            <div className="d-flex align-items-center">
                              <i className="fas fa-check-circle fa-2x text-success me-3"></i>
                              <div>
                                <h6 className="alert-heading mb-1">
                                  <i className="fas fa-credit-card me-2"></i>
                                  Maya Payment Completed
                                </h6>
                                <p className="mb-1">
                                  <strong>Amount Paid:</strong> ₱{Number(paidMayaPayment.amount_paid || 0).toLocaleString()}
                                </p>
                                <p className="mb-0">
                                  <strong>Payment Date:</strong> {new Date(paidMayaPayment.paid_at).toLocaleString()}
                                </p>
                                <small className="text-muted">
                                  <i className="fas fa-lock me-1"></i>
                                  Payment information is read-only as the Maya payment has been successfully completed.
                                </small>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {additionalChargesTotal > 0 && !isMayaPaymentCompleted && (
                        <div className="col-12">
                          <div className="alert alert-warning border-0 shadow-sm">
                            <div className="d-flex align-items-start">
                              <i className="fas fa-exclamation-triangle fa-2x text-warning me-3"></i>
                              <div className="flex-grow-1">
                                <h6 className="alert-heading mb-1">
                                  <i className="fas fa-info-circle me-2"></i>
                                  Additional Items Selected
                                </h6>
                                <p className="mb-1">
                                  <strong>Additional Charges:</strong> ₱{additionalChargesTotal.toLocaleString()}
                                </p>
                                <p className="mb-0 small">
                                  <i className="fas fa-lightbulb me-1"></i>
                                  <strong>HMO/Maya payments only cover the service amount.</strong> If the patient's HMO/Maya payment doesn't cover additional charges, 
                                  select "Partially Paid" and enter the on-site payment amount for the additional items.
                                </p>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="col-12">
                        <label className="form-label fw-semibold">
                          <i className="fas fa-credit-card text-primary me-1"></i>
                          Payment Status
                        </label>
                        <select
                          className="form-select"
                          value={paymentStatus}
                          onChange={(e) => setPaymentStatus(e.target.value)}
                          disabled={isMayaPaymentCompleted}
                        >
                          <option value="paid">Fully Paid</option>
                          <option value="hmo_fully_covered">HMO Fully Covered</option>
                          <option value="partial">Partially Paid (HMO didn't cover all)</option>
                          <option value="unpaid">Unpaid (Maya failed)</option>
                        </select>
                        {isMayaPaymentCompleted && (
                          <div className="form-text text-muted">
                            <i className="fas fa-lock me-1"></i>
                            Payment status cannot be changed as Maya payment is already completed.
                          </div>
                        )}
                      </div>

                      {paymentStatus === "partial" && !isMayaPaymentCompleted && (
                        <div className="col-12">
                          <label className="form-label fw-semibold">
                            <i className="fas fa-money-bill text-primary me-1"></i>
                            On-site Payment Amount (₱)
                          </label>
                          <div className="input-group">
                            <span className="input-group-text">₱</span>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              max={balance}
                              className="form-control"
                              value={onsitePaymentAmount}
                              onChange={(e) => setOnsitePaymentAmount(e.target.value)}
                              placeholder={`Maximum: ${balance.toLocaleString()}`}
                            />
                          </div>
                          <div className="form-text">
                            Maximum amount: ₱{balance.toLocaleString()}
                          </div>
                        </div>
                      )}

                      {paymentStatus === "unpaid" && !isMayaPaymentCompleted && (
                        <div className="col-12">
                          <label className="form-label fw-semibold">
                            <i className="fas fa-exchange-alt text-primary me-1"></i>
                            Payment Method Change
                          </label>
                          <select
                            className="form-select"
                            value={paymentMethodChange}
                            onChange={(e) => setPaymentMethodChange(e.target.value)}
                          >
                            <option value="">Select change</option>
                            <option value="maya_to_cash">Change Maya to Cash Payment</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

            </div>
            
            {/* Fixed Navigation Footer */}
            <div className="modal-footer bg-light border-top flex-shrink-0 py-3" style={{
              position: "sticky",
              bottom: 0,
              zIndex: 1,
              backgroundColor: "#f8f9fa"
            }}>
              <div className="d-flex justify-content-between w-100 align-items-center">
                <div>
                  {step > 1 && (
                    <button
                      type="button"
                      onClick={() => setStep(step - 1)}
                      className="btn btn-outline-secondary"
                      style={{minWidth: '100px'}}
                    >
                      <i className="fas fa-arrow-left me-2"></i>
                      Previous
                    </button>
                  )}
                </div>
                <div className="d-flex align-items-center">
                  <small className="text-muted me-3">
                    Step {step} of 3
                  </small>
                  {step < 3 ? (
                    <button
                      type="button"
                      onClick={() => setStep(step + 1)}
                      className="btn btn-primary"
                      style={{minWidth: '100px'}}
                    >
                      Next
                      <i className="fas fa-arrow-right ms-2"></i>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={handleComplete}
                      disabled={submitting}
                      className="btn btn-success"
                      style={{minWidth: '140px'}}
                    >
                      {submitting ? (
                        <>
                          <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                          Completing...
                        </>
                      ) : (
                        <>
                          <i className="fas fa-check me-2"></i>
                          Complete Visit
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

  {showNoStockWarning && (
    <div className="modal fade show d-block" style={{
      backgroundColor: 'rgba(0,0,0,0.65)',
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 1060,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "1rem"
    }} tabIndex="-1" role="dialog">
      <div className="modal-dialog" role="document">
        <div className="modal-content">
          <div className="modal-header bg-warning text-dark">
            <h5 className="modal-title fw-bold">
              <i className="bi bi-exclamation-triangle me-2"></i>
              No Consumables Recorded
            </h5>
            <button
              type="button"
              className="btn-close"
              onClick={() => {
                setShowNoStockWarning(false);
                setPendingPayload(null);
              }}
              aria-label="Close"
            ></button>
          </div>
          <div className="modal-body">
            <p>
              You are about to complete this visit without logging any inventory items. This will finalize the visit without reducing stock levels.
            </p>
            <p className="mb-0 fw-semibold">
              If items were used, please record them before continuing. Do you still want to complete the visit?
            </p>
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-outline-secondary"
              onClick={() => {
                setShowNoStockWarning(false);
                setPendingPayload(null);
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-warning"
              onClick={async () => {
                setShowNoStockWarning(false);
                setWarningAcknowledged(true);
                if (pendingPayload) {
                  await submitCompletion(pendingPayload);
                }
              }}
              disabled={submitting}
            >
              Complete Without Items
            </button>
          </div>
        </div>
      </div>
    </div>
  )}
    </>
  );
}
