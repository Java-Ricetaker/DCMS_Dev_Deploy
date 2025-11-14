import { useState } from "react";
import teethChartImage from "../../pages/Dentist/Teeth_Chart.png";
import primaryTeethChartImage from "../../pages/Dentist/Primary_Teeth_Chart.png";
import toast from "react-hot-toast";

const ToothChart = ({ selectedTeeth = [], onTeethChange, showChart = false, onToggleChart, maxSelection = null }) => {
  const [activeTab, setActiveTab] = useState("adult"); // "adult" or "primary"

  // Adult teeth data based on the Universal Numbering System (1-32)
  const adultToothData = [
    // Upper Right (1-8)
    { number: 1, name: "Third Molar", quadrant: "Upper Right" },
    { number: 2, name: "Second Molar", quadrant: "Upper Right" },
    { number: 3, name: "First Molar", quadrant: "Upper Right" },
    { number: 4, name: "Second Premolar", quadrant: "Upper Right" },
    { number: 5, name: "First Premolar", quadrant: "Upper Right" },
    { number: 6, name: "Canine", quadrant: "Upper Right" },
    { number: 7, name: "Lateral Incisor", quadrant: "Upper Right" },
    { number: 8, name: "Central Incisor", quadrant: "Upper Right" },
    
    // Upper Left (9-16)
    { number: 9, name: "Central Incisor", quadrant: "Upper Left" },
    { number: 10, name: "Lateral Incisor", quadrant: "Upper Left" },
    { number: 11, name: "Canine", quadrant: "Upper Left" },
    { number: 12, name: "First Premolar", quadrant: "Upper Left" },
    { number: 13, name: "Second Premolar", quadrant: "Upper Left" },
    { number: 14, name: "First Molar", quadrant: "Upper Left" },
    { number: 15, name: "Second Molar", quadrant: "Upper Left" },
    { number: 16, name: "Third Molar", quadrant: "Upper Left" },
    
    // Lower Left (17-24)
    { number: 17, name: "Third Molar", quadrant: "Lower Left" },
    { number: 18, name: "Second Molar", quadrant: "Lower Left" },
    { number: 19, name: "First Molar", quadrant: "Lower Left" },
    { number: 20, name: "Second Premolar", quadrant: "Lower Left" },
    { number: 21, name: "First Premolar", quadrant: "Lower Left" },
    { number: 22, name: "Canine", quadrant: "Lower Left" },
    { number: 23, name: "Lateral Incisor", quadrant: "Lower Left" },
    { number: 24, name: "Central Incisor", quadrant: "Lower Left" },
    
    // Lower Right (25-32)
    { number: 25, name: "Central Incisor", quadrant: "Lower Right" },
    { number: 26, name: "Lateral Incisor", quadrant: "Lower Right" },
    { number: 27, name: "Canine", quadrant: "Lower Right" },
    { number: 28, name: "First Premolar", quadrant: "Lower Right" },
    { number: 29, name: "Second Premolar", quadrant: "Lower Right" },
    { number: 30, name: "First Molar", quadrant: "Lower Right" },
    { number: 31, name: "Second Molar", quadrant: "Lower Right" },
    { number: 32, name: "Third Molar", quadrant: "Lower Right" },
  ];

  // Primary teeth data based on the Universal Numbering System (A-T)
  const primaryToothData = [
    // Upper Right (A-E)
    { letter: "A", name: "Second Molar", quadrant: "Upper Right" },
    { letter: "B", name: "First Molar", quadrant: "Upper Right" },
    { letter: "C", name: "Canine", quadrant: "Upper Right" },
    { letter: "D", name: "Lateral Incisor", quadrant: "Upper Right" },
    { letter: "E", name: "Central Incisor", quadrant: "Upper Right" },
    
    // Upper Left (F-J)
    { letter: "F", name: "Central Incisor", quadrant: "Upper Left" },
    { letter: "G", name: "Lateral Incisor", quadrant: "Upper Left" },
    { letter: "H", name: "Canine", quadrant: "Upper Left" },
    { letter: "I", name: "First Molar", quadrant: "Upper Left" },
    { letter: "J", name: "Second Molar", quadrant: "Upper Left" },
    
    // Lower Left (K-O)
    { letter: "K", name: "Second Molar", quadrant: "Lower Left" },
    { letter: "L", name: "First Molar", quadrant: "Lower Left" },
    { letter: "M", name: "Canine", quadrant: "Lower Left" },
    { letter: "N", name: "Lateral Incisor", quadrant: "Lower Left" },
    { letter: "O", name: "Central Incisor", quadrant: "Lower Left" },
    
    // Lower Right (P-T)
    { letter: "P", name: "Central Incisor", quadrant: "Lower Right" },
    { letter: "Q", name: "Lateral Incisor", quadrant: "Lower Right" },
    { letter: "R", name: "Canine", quadrant: "Lower Right" },
    { letter: "S", name: "First Molar", quadrant: "Lower Right" },
    { letter: "T", name: "Second Molar", quadrant: "Lower Right" },
  ];

  const handleToothClick = (toothIdentifier) => {
    const toothStr = toothIdentifier.toString();
    let newSelectedTeeth = [...selectedTeeth];
    
    if (newSelectedTeeth.includes(toothStr)) {
      // Remove tooth if already selected
      newSelectedTeeth = newSelectedTeeth.filter(t => t !== toothStr);
    } else {
      // Check if we've reached the maximum selection limit
      if (maxSelection && newSelectedTeeth.length >= maxSelection) {
        toast.error(`You can only select up to ${maxSelection} teeth as specified in the appointment.`);
        return;
      }
      // Add tooth if not selected
      newSelectedTeeth.push(toothStr);
    }
    
    // Sort teeth appropriately based on type
    if (activeTab === "adult") {
      newSelectedTeeth.sort((a, b) => parseInt(a) - parseInt(b));
    } else {
      newSelectedTeeth.sort();
    }
    onTeethChange(newSelectedTeeth.join(','));
  };

  const clearAllTeeth = () => {
    onTeethChange('');
  };

  const selectAllTeeth = () => {
    let allTeeth;
    if (activeTab === "adult") {
      allTeeth = adultToothData.map(tooth => tooth.number.toString());
    } else {
      allTeeth = primaryToothData.map(tooth => tooth.letter);
    }
    
    // Apply max selection limit if specified
    if (maxSelection && allTeeth.length > maxSelection) {
      allTeeth = allTeeth.slice(0, maxSelection);
      toast(`Selection limited to ${maxSelection} teeth as specified in the appointment.`, { icon: "ℹ️" });
    }
    
    onTeethChange(allTeeth.join(','));
  };

  // Handle tab switching - clear selection when switching between adult and primary
  const handleTabSwitch = (newTab) => {
    if (newTab !== activeTab) {
      setActiveTab(newTab);
      onTeethChange(''); // Clear the selection
    }
  };

  if (!showChart) {
    return (
      <div className="mb-3">
        <button
          type="button"
          className="btn btn-outline-primary btn-sm"
          onClick={onToggleChart}
        >
          <i className="bi bi-diagram-3 me-1"></i>
          Show Tooth Chart
        </button>
      </div>
    );
  }

  return (
    <div className="mb-4">
      <div className="d-flex justify-content-between align-items-center mb-3">
        <h6 className="mb-0">
          <i className="bi bi-diagram-3 me-2"></i>
          Tooth Chart Reference
        </h6>
        <button
          type="button"
          className="btn btn-outline-secondary btn-sm"
          onClick={onToggleChart}
        >
          <i className="bi bi-x-lg me-1"></i>
          Hide Chart
        </button>
      </div>
      
      <div className="card">
        <div className="card-body">
          {/* Chart Header */}
          <div className="text-center mb-3">
            <h6 className="text-muted">Universal Numbering System</h6>
            <p className="text-muted small mb-0">Click on tooth numbers/letters below to select/deselect</p>
          </div>

          {/* Tab Navigation */}
          <div className="d-flex justify-content-center mb-4">
            <div className="btn-group" role="group" aria-label="Tooth chart tabs">
              <button
                type="button"
                className={`btn ${activeTab === "adult" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => handleTabSwitch("adult")}
              >
                <i className="bi bi-person me-1"></i>
                Adult Teeth (1-32)
              </button>
              <button
                type="button"
                className={`btn ${activeTab === "primary" ? "btn-primary" : "btn-outline-primary"}`}
                onClick={() => handleTabSwitch("primary")}
              >
                <i className="bi bi-person-heart me-1"></i>
                Primary Teeth (A-T)
              </button>
            </div>
          </div>

          {/* General Note */}
          <div className="alert alert-info mb-4">
            <i className="bi bi-info-circle me-2"></i>
            <strong>Note:</strong> If the teeth done is in letters (A-T), it's primary teeth. If it's in numbers (1-32), it's adult teeth.
            {maxSelection && (
              <div className="mt-2">
                <i className="bi bi-exclamation-triangle me-2"></i>
                <strong>Selection Limit:</strong> You can select up to {maxSelection} teeth as specified in the appointment.
              </div>
            )}
          </div>
          
           {/* Larger Layout with Image and Buttons Side by Side */}
           <div className="row">
             {/* Left Side - Larger Image */}
             <div className="col-md-5 mb-3">
               <div className="text-center">
                 <img 
                   src={activeTab === "adult" ? teethChartImage : primaryTeethChartImage} 
                   alt={activeTab === "adult" ? "Adult Dental Chart Reference" : "Primary Teeth Chart Reference"} 
                   className="img-fluid"
                   style={{ 
                     maxWidth: '300px', 
                     height: 'auto',
                     border: '1px solid #dee2e6',
                     borderRadius: '8px',
                     backgroundColor: '#f8f9fa'
                   }}
                 />
                 <small className="text-muted d-block mt-2">
                   {activeTab === "adult" ? "Adult Teeth Reference Chart" : "Primary Teeth Reference Chart"}
                 </small>
               </div>
             </div>
             
             {/* Right Side - Interactive Selection */}
             <div className="col-md-7">
               <div className="text-center mb-3">
                 <h6 className="text-primary">
                   <i className="bi bi-mouse me-2"></i>
                   Click to Select Teeth
                 </h6>
               </div>
               
               {activeTab === "adult" ? (
                 <>
                   {/* Adult Teeth - Upper Teeth (1-16) */}
                   <div className="mb-4">
                     <div className="text-center mb-3">
                       <strong className="text-primary">UPPER TEETH (1-16)</strong>
                     </div>
                     <div className="d-flex justify-content-center flex-wrap gap-2">
                      {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16].map(toothNumber => {
                        const tooth = adultToothData.find(t => t.number === toothNumber);
                        return (
                          <button
                            key={toothNumber}
                            type="button"
                            className={`btn ${selectedTeeth.includes(toothNumber.toString()) 
                              ? 'btn-warning' 
                              : 'btn-outline-primary'
                            }`}
                           style={{ 
                              width: toothNumber >= 10 ? '50px' : '45px', 
                              height: '45px',
                              fontSize: '1rem',
                              fontWeight: 'bold',
                              whiteSpace: 'nowrap',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            onClick={() => handleToothClick(toothNumber)}
                            title={`Tooth ${toothNumber}: ${tooth?.name}`}
                          >
                            {toothNumber}
                          </button>
                        );
                      })}
                     </div>
                   </div>
                   
                   {/* Adult Teeth - Lower Teeth (32-17) */}
                   <div className="mb-3">
                     <div className="text-center mb-3">
                       <strong className="text-primary">LOWER TEETH (32-17)</strong>
                     </div>
                     <div className="d-flex justify-content-center flex-wrap gap-2">
                      {[32,31,30,29,28,27,26,25,24,23,22,21,20,19,18,17].map(toothNumber => {
                        const tooth = adultToothData.find(t => t.number === toothNumber);
                        return (
                          <button
                            key={toothNumber}
                            type="button"
                            className={`btn ${selectedTeeth.includes(toothNumber.toString()) 
                              ? 'btn-warning' 
                              : 'btn-outline-primary'
                            }`}
                           style={{ 
                              width: toothNumber >= 10 ? '50px' : '45px', 
                              height: '45px',
                              fontSize: '1rem',
                              fontWeight: 'bold',
                              whiteSpace: 'nowrap',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                            onClick={() => handleToothClick(toothNumber)}
                            title={`Tooth ${toothNumber}: ${tooth?.name}`}
                          >
                            {toothNumber}
                          </button>
                        );
                      })}
                     </div>
                   </div>
                 </>
               ) : (
                 <>
                   {/* Primary Teeth - Upper Teeth (A-J) */}
                   <div className="mb-4">
                     <div className="text-center mb-3">
                       <strong className="text-primary">UPPER TEETH (A-J)</strong>
                     </div>
                     <div className="d-flex justify-content-center flex-wrap gap-2">
                       {["A","B","C","D","E","F","G","H","I","J"].map(toothLetter => {
                         const tooth = primaryToothData.find(t => t.letter === toothLetter);
                         return (
                           <button
                             key={toothLetter}
                             type="button"
                             className={`btn ${selectedTeeth.includes(toothLetter) 
                               ? 'btn-warning' 
                               : 'btn-outline-primary'
                             }`}
                            style={{ 
                              width: '45px', 
                              height: '45px',
                              fontSize: '1rem',
                              fontWeight: 'bold',
                              whiteSpace: 'nowrap',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                             onClick={() => handleToothClick(toothLetter)}
                             title={`Tooth ${toothLetter}: ${tooth?.name}`}
                           >
                             {toothLetter}
                           </button>
                         );
                       })}
                     </div>
                   </div>
                   
                   {/* Primary Teeth - Lower Teeth (K-T) */}
                   <div className="mb-3">
                     <div className="text-center mb-3">
                       <strong className="text-primary">LOWER TEETH (K-T)</strong>
                     </div>
                     <div className="d-flex justify-content-center flex-wrap gap-2">
                       {["K","L","M","N","O","P","Q","R","S","T"].map(toothLetter => {
                         const tooth = primaryToothData.find(t => t.letter === toothLetter);
                         return (
                           <button
                             key={toothLetter}
                             type="button"
                             className={`btn ${selectedTeeth.includes(toothLetter) 
                               ? 'btn-warning' 
                               : 'btn-outline-primary'
                             }`}
                            style={{ 
                              width: '45px', 
                              height: '45px',
                              fontSize: '1rem',
                              fontWeight: 'bold',
                              whiteSpace: 'nowrap',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                             onClick={() => handleToothClick(toothLetter)}
                             title={`Tooth ${toothLetter}: ${tooth?.name}`}
                           >
                             {toothLetter}
                           </button>
                         );
                       })}
                     </div>
                   </div>
                 </>
               )}
             </div>
           </div>
          
          {/* Action Buttons */}
          <div className="d-flex justify-content-center gap-2 mt-3">
            <button
              type="button"
              className="btn btn-outline-success btn-sm"
              onClick={selectAllTeeth}
            >
              <i className="bi bi-check-all me-1"></i>
              Select All
            </button>
            <button
              type="button"
              className="btn btn-outline-danger btn-sm"
              onClick={clearAllTeeth}
            >
              <i className="bi bi-x-lg me-1"></i>
              Clear All
            </button>
          </div>
          
          {/* Selected Teeth Display */}
          {selectedTeeth.length > 0 && (
            <div className="mt-3 p-3 bg-light rounded border">
              <div className="d-flex align-items-center justify-content-between">
                <div>
                  <small className="text-muted d-block">Selected teeth:</small>
                  <strong className="text-primary fs-6">{selectedTeeth.join(', ')}</strong>
                </div>
                <div className="text-end">
                  <small className="text-muted d-block">Total count:</small>
                  <strong className="text-success">{selectedTeeth.length} tooth{selectedTeeth.length !== 1 ? 's' : ''}</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ToothChart;
