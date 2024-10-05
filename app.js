async function loadDataset() {
    const response = await fetch('dataset.json');
    if (!response.ok) {
        throw new Error("Failed to load dataset.");
    }
    return await response.json();
}

function preprocessData(data) {
    return data.map(item => ({
        text: item.text.toLowerCase().replace(/[^a-z0-9\s]/g, ''),
        label: item.label
    }));
}

function encodeText(data, maxLength) {
    const vocab = {};
    let index = 0;

    // Build vocabulary
    data.forEach(item => {
        item.text.split(' ').forEach(word => {
            if (!vocab[word]) {
                vocab[word] = index++;
            }
        });
    });

    // Encode data with padding/truncating to maxLength
    const encodedData = data.map(item => {
        const encoded = item.text.split(' ').map(word => vocab[word] || -1);

        // Padding or truncating to maxLength
        const paddedEncoded = encoded.length < maxLength
            ? [...encoded, ...Array(maxLength - encoded.length).fill(-1)]  // Pad with -1
            : encoded.slice(0, maxLength);  // Truncate to maxLength

        return { encoded: paddedEncoded, label: item.label };
    });

    return { encodedData, vocab };
}

function createModel(inputShape) {
    const model = tf.sequential();
    model.add(tf.layers.dense({ units: 16, activation: 'relu', inputShape }));
    model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
    model.compile({ optimizer: 'adam', loss: 'binaryCrossentropy', metrics: ['accuracy'] });
    return model;
}

async function trainModel(model, trainingData) {
    const xs = tf.tensor2d(trainingData.map(item => item.encoded));
    const ys = tf.tensor2d(trainingData.map(item => item.label), [trainingData.length, 1]);

    const earlyStopping = tf.callbacks.earlyStopping({
        monitor: 'val_loss', // Monitor validation loss
        patience: 5,         // Number of epochs with no improvement after which training will be stopped
    });

    await model.fit(xs, ys, {
        epochs: 50,
        validationSplit: 0.2, // Use 20% of the data for validation
        callbacks: [earlyStopping]
    });
}

async function analyzeContent(model, vocab, text) {
    const maxLength = 40; // Define the max length for encoding
    const encodedText = text.toLowerCase().replace(/[^a-z0-9\s]/g, '')
        .split(' ').map(word => vocab[word] || -1);

    // Padding or truncating to maxLength
    const paddedEncodedText = encodedText.length < maxLength
        ? [...encodedText, ...Array(maxLength - encodedText.length).fill(-1)]
        : encodedText.slice(0, maxLength);

    const inputTensor = tf.tensor2d([paddedEncodedText]);
    const prediction = model.predict(inputTensor);
    const result = await prediction.data();
    
    // Calculate the percentage of AI involvement
    const aiProbability = result[0];
    const humanProbability = 1 - aiProbability;

    return {
        text: aiProbability >= 0.5 
            ? 'generated by <span style="color: #FF0000;">Artificial Intelligence (AI)</span>, and not written by a <span style="color: #34C759;">human</span>. <i class="fa-solid fa-gears"></i>' 
            : 'written by a <span style="color: #34C759;">human</span>, and not generated by <span style="color: #FF0000;">Artificial Intelligence (AI)</span>. <i class="fa-solid fa-pen"></i>',
        aiPercentage: (aiProbability * 100).toFixed(2), // AI involvement percentage
        humanPercentage: (humanProbability * 100).toFixed(2) // Human involvement percentage
    };
}

async function retrainModel(newDataset) {
    const preprocessedData = preprocessData(newDataset);
    const { encodedData, vocab } = encodeText(preprocessedData, 40); // Use the same maxLength

    let model;
    try {
        model = await loadModel(); // Implement loadModel to fetch the existing model
    } catch (error) {
        console.error("Failed to load content checker, attempting to reload:", error);
        model = createModel([40]); // Create a new model if loading fails
    }

    // Retrain the model with the new data
    await trainModel(model, encodedData);

    // Save the retrained model
    await model.save('localstorage://ridgpt'); // Save to local storage
}

// Load the model function
async function loadModel() {
    return await tf.loadLayersModel('localstorage://ridgpt'); // Update with your model name
}

document.getElementById('checkBtn').addEventListener('click', async function() {
    const content = document.getElementById('contentInput').value.trim();
    const resultElement = document.getElementById('result');
    const loader = document.getElementById('loader');

    if (!content) {
        alert("Please enter some content.");
        return;
    }

    const maxLength = 40; // Define the max length for encoding

    // Show loader and hide results initially
    loader.style.display = 'block';
    resultElement.style.display = 'none';

    try {
        const dataset = await loadDataset();
        const preprocessedData = preprocessData(dataset);
        const { encodedData, vocab } = encodeText(preprocessedData, maxLength); // Pass maxLength

        const model = createModel([maxLength]); // Update input shape to maxLength
        await trainModel(model, encodedData);

        const analysisResult = await analyzeContent(model, vocab, content);
        
        // Hide loader and show the result with percentages
        loader.style.display = 'none';
        resultElement.innerHTML = `
         <button id="retrainBtn" style="margin-top: 0px; margin-bottom: 20px;">Reload Content Checker <i class="fa-solid fa-arrows-rotate"></i> <h6 class="small">Only reload the content checker if you believe that the given result is 100% inaccurate. <i class="fa-solid fa-circle-info"></i></h6></button>
        
                    <h6 class="reshed" style="margin-bottom: 0px">Results <i class="fa-solid fa-chevron-down"></i></h6>
                    <h6 class="reshed" style="font-size:0.7em; margin-top: 0px;">Results may not always be accurate. <i class="fa-solid fa-triangle-exclamation"></i></h6>
                    
                <span style="opacity: 0.8;>
                    
            This content was ${analysisResult.text} 
            <hr>
            <span style="color: #FF0000; margin-bottom: 20px;">Artificial Intelligence (AI)</span> Involvement: ${analysisResult.aiPercentage}% <i class="fa-solid fa-robot"></i>

            <span style="margin-top: 20px; color: #34C759;">Human</span> Involvement: ${analysisResult.humanPercentage}% <i class="fa-solid fa-brain"></i>
            
            </span>
        `;
        resultElement.style.display = 'block';
    } catch (error) {
        console.error(error);
        alert("An error has occurred. Check the console for details.");
        loader.style.display = 'none'; // Hide loader if there's an error
    }
});

// Retrain button event listener
document.getElementById('retrainBtn').addEventListener('click', async function() {
    const newDataset = await loadDataset(); // Load new dataset for retraining
    try {
        await retrainModel(newDataset); // Retrain the model with new data
        alert("Content checker successfully reloaded.");
    } catch (error) {
        console.error("Error while reloading the content checker:", error);
        alert("Failed to reload the content checker. Check the console for details.");
    }
});