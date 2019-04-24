var imported = document.createElement('script');
document.head.appendChild(imported);

// Model and output
var model;
let noseX;
let noseY;

// Evaluating
var interval;
var start = 0;
var ticks = 0;

let overlay;
let video;

let vidWidth = 240;
let vidHeight = 240;

// Bounding box overlay code
let boundX;
let boundY;
let boundWidth;
let boundHeight;

let src;
let dst;
let cap;
let gray;
let face;
let classifier;
cv['onRuntimeInitialized']=()=>{
  // Create desired matricies
  src = new cv.Mat(webcamElement.height, webcamElement.width, cv.CV_8UC4);
  dst = new cv.Mat(vidHeight, vidWidth, cv.CV_8UC4)
  cap = new cv.VideoCapture(webcam); 
  gray = new cv.Mat();
  face = new cv.Mat();

  classifier = new cv.CascadeClassifier();  // initialize classifier
  let utils = new Utils('errorMessage'); //use utils class
  let faceCascadeFile = 'haarcascade_frontalface_default.xml'; // path to xml
  // use createFileFromUrl to "pre-build" the xml
  utils.createFileFromUrl(faceCascadeFile, faceCascadeFile, () => {
    classifier.load(faceCascadeFile); // in the callback, load the cascade from file 
  });
};

// Time stamps for the data collection.
let timeStampChunks = ["Image UTC TimeStamps\r\n"];
let snapNum = 0;

// To save a zip file.
let zip = new JSZip();
// Button to save the current data that you have taken.
let downloadButton = document.getElementById('Download');

downloadButton.addEventListener('click', (ev)=>{
  // Call the snap shot function.
  downloadData();
  console.log("The data is being downloaded to the user's computer.")
});

// Set up the webcam
const webcamElement = document.getElementById('webcam');
const outputElement = document.getElementById('canvasOutput');
async function setupWebcam() {
  return new Promise((resolve, reject) => {
    const navigatorAny = navigator;
    navigator.getUserMedia = navigator.getUserMedia ||
      navigatorAny.webkitGetUserMedia || navigatorAny.mozGetUserMedia ||
      navigatorAny.msGetUserMedia;
    if (navigator.getUserMedia) {
      navigator.getUserMedia({video: true},
      stream => {
        webcamElement.srcObject = stream;
        webcamElement.addEventListener('loadeddata',  () => resolve(), false);
      },
      error => reject());
    } else {
      reject();
    }
  });
}

// Start the loading process
imported.src = 'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@1.0.1';

imported.onload = async function(){
  // Set up
  await setupWebcam();
  // model = await tf.loadLayersModel('https://matthewcalligaro.github.io/TheNoseArcade/playTurtleChase/custom/model.json');
  model = await tf.loadLayersModel('https://nickhmc.github.io/nosearcade-sandbox/playTurtleChase/custom/model.json');

  // Process the video
  interval = window.setInterval(function () {
    processVideo();
  }, 1);
}
/**
 * Computes the nose position of the first face in the image.
 */
function processVideo() {
  // Capture the a frame of the video as an OpenCV.js image in the variable src.
  cap.read(src);

  // Record the time of the video frame.
  let currTime = Date.now();

  // src.copyTo(dst);
  let uhsize = new cv.Size(vidHeight, vidWidth);

  // Identify the face
  cv.resize (src, dst, uhsize, -1, 1);
  cv.cvtColor(dst, gray, cv.COLOR_RGBA2GRAY, 0);

  // Identify the face
  cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY, 0);
  
  // Initialize bounding box
  let faces = new cv.RectVector();

  // Detect faces
  let msize = new cv.Size(0, 0);
  classifier.detectMultiScale(gray, faces, 1.1, 3, 0, msize, msize);

  // If no faces detected, stop
  if (faces.size() == 0) {
    console.log("Unable to find a face. Saving the image into a zip file for future reference.")

    // Compute the filename
    let filename = "color_image"+snapNum+".png";

    //Convert the src image to a blob.
    let imageBlob = Blob(src, {type: "image/png"});
    // Save the desired image.
    zip.file(filename, imageBlob);

    filename = "gray_image"+snapNum+".png";
    let grayBlob = Blob(gray,{type:"image/png"});
    zip.file(filename, grayBlob);

    snapNum = snapNum + 1;
    
    // Push the time of the photo to the array.
    timeStampChunks.push(currTime+'\r\n');
    return;
  }

  let faceTransforms = faces.get(0);

  // Get region of interest
  let roiSrc = src.roi(faceTransforms);

  let dsize = new cv.Size(96, 96);
  cv.resize(roiSrc, face, dsize, 0, 0, cv.INTER_AREA);

  // Convert to ImageData
  let imgData = new ImageData(new Uint8ClampedArray(face.data),face.cols,face.rows);

  const image = tf.browser.fromPixels(imgData);
  const img = image.reshape([1, 96, 96, 3]);

  // Predict
  const prediction = model.predict(img);

  // Record the result
  prediction.array().then(function(result) {

    noseX = (result[0][0] * this.width / 93.0) + this.x;
    // TODO This is pretty weird and I'm not sure if it jives with the coordinate system, but that is the nose.
    noseY = (result[0][1] * this.height / 93.0) + this.y;

    // Bounding box overlay code
    boundX = this.x * 640 / 240;
    boundY = this.y * 360 / 240;
    boundWidth = this.width * 640 / 240;
    boundHeight = this.height * 360 / 240;

    let point1 = new cv.Point(this.x, this.y);
    let point2 = new cv.Point(this.x + this.width, this.y + this.height);
    let point3 = new cv.Point(noseX, noseY);
    cv.rectangle(dst, point1, point2, [255, 0, 0, 255]);
    cv.circle(dst, point3, 1, [0, 255, 0, 255]);
    
    cv.imshow(outputElement, dst);

    sendCoords(noseX, noseY);
  }.bind(faceTransforms));
}

/**
 * Function that p5 calls initially to set up graphics
 */
function setup() {
  // Webcam capture
  video = createCapture(VIDEO);
  video.size(640, 360);
  video.parent('videoContainer')

  // Graphics overlay for monitor annotations
  pixelDensity(1);
  overlay = createGraphics(640, 360);
  overlay.parent('videoContainer');

  // Hide the video so it doesn't render
  video.hide();

  // Show graphics
  overlay.show();
  // Flip graphics so you get proper mirroring of video and nose dot
  overlay.translate(640,0);
  overlay.scale(-1.0, 1.0);
}

/**
 * Function that p5 calls repeatedly to render graphics
 */
function draw() {
  overlay.clear();

  // Render video
  overlay.image(video, 0, 0);

  // Render nose dot
  overlay.stroke(0, 225, 0); // Green
  overlay.strokeWeight(5);
  overlay.ellipse(noseX  * 640 / 240, noseY * 360 / 240, 1, 1);

  // Bounding box overlay code
  // Render bounding box
  overlay.stroke(255, 0, 0); // Red
  overlay.noFill();
  overlay.rect(boundX, boundY, boundWidth, boundHeight);

  // Render bounding origin dot
  overlay.stroke(0, 0, 255); // Blue
  overlay.ellipse(boundX, boundY, 1, 1);
}


/**
 * Send new nose coordinates to the game
 * @param x the x position of the nose
 * @param y the y position of the nose
 */
function sendCoords(x, y) {
  // Truncate to int and invert both axes
  let fixedNoseX = parseInt(vidWidth - x);
  let fixedNoseY = parseInt(vidHeight - y);

  // Bitpack x into bits 0-9, y into 10-19
  let packedCoords = 0;
  packedCoords |= fixedNoseX;
  packedCoords |= fixedNoseY << 10;

  // Bottom 9 bits get corrupted; move coords out of the way
  packedCoords = packedCoords << 9;

  // Attempt to send packed coordinates to the game
  try {
    gameInstance.SendMessage('Controller', 'UpdateFacePosition', packedCoords);
    console.log('Success - Coordinates ' + fixedNoseX + ', ' + fixedNoseY + ' sent successfully.');
  } catch (err) {
    console.log('Failure - Coordinates ' + fixedNoseX + ', ' + fixedNoseY + ' failed to send: ' + err);
  }
}

/**
 * Download a zip file which contains the timestamps of the video frames,
 * the timestamps and the (X,Y) positions of the nose as measured by PoseNet.
 * It also contains a PNG file for every image that registered a detectNose()
 * event.
 */
function downloadData(){
  let blobTime = new Blob(timeStampChunks, {type: "text/plain;charset=utf-8"});

  // Add the text files to the zip
  zip.file("image_time_stamps.txt", blobTime);

  zip.generateAsync({type:"blob"})
  .then(function(zip) {
    saveAs(zip, "images_from_user_test.zip");
    }); // Force the downlod of the zip file.

  // Reset the data parameters.
  timeStampChunks = ["Image UTC TimeStamps\r\n"];
  snapNum = 0;
}