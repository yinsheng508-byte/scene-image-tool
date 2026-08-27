// Debug mode switch - set to false in production
const DEBUG_MODE = false;

// Save folder path management
let saveFolderPath = null;
const STORAGE_KEY_SAVE_PATH = 'compose_save_folder_path';

const root = document.querySelector('#composeRoot');
if (!root) { console.warn('Compose root not found'); }
const doc = root || document;

const canvas = doc.querySelector('#editorCanvas');
const ctx = canvas.getContext('2d');
const bgInput = doc.querySelector('#bgInput');
const pptInput = doc.querySelector('#pptInput');
const instruction = doc.querySelector('#instruction');
const opacityInput = doc.querySelector('#opacity');
const opacityVal = doc.querySelector('#opacityVal');
const blendModeSelect = doc.querySelector('#blendMode');
const resetPointsBtn = doc.querySelector('#resetPoints');
const previewList = doc.querySelector('#previewList');
const downloadAllBtn = doc.querySelector('#downloadAllBtn');
const selectSaveFolderBtn = doc.querySelector('#selectSaveFolderBtn');
const saveFolderPathDisplay = doc.querySelector('#saveFolderPath');

const PADDING = 200; // Extra space around background image
const MAX_PREVIEW_SIZE = 2560; // PERFORMANCE: Limit preview canvas max dimension to prevent crash

let bgImage = null;
let bgImageFileSize = 0; // Store background image file size in bytes
let bgImageTitle = '场景化图片';
let pptImages = []; // Array of { name, img }
let activePptIndex = -1;
let points = []; // [TL, TR, BR, BL]
let draggingPoint = -1;
let currentZoom = 1.0; // Zoom level
let previewScale = 1.0; // PERFORMANCE: Scale factor for proxy resolution (preview vs original)

// Texture Manager - Prevents redundant texture uploads
const TextureManager = {
    currentPptImage: null,
    currentBgImage: null,

    needsUploadPpt(image) {
        return this.currentPptImage !== image;
    },

    needsUploadBg(image) {
        return this.currentBgImage !== image;
    },

    markPptUploaded(image) {
        this.currentPptImage = image;
    },

    markBgUploaded(image) {
        this.currentBgImage = image;
    },

    cleanup() {
        if (glPptTexture) gl.deleteTexture(glPptTexture);
        if (glBgTexture) gl.deleteTexture(glBgTexture);
        this.currentPptImage = null;
        this.currentBgImage = null;
    },

    reset() {
        this.currentPptImage = null;
        this.currentBgImage = null;
    }
};

// RAF Rendering System - Prevents redundant draws
let isDirty = false;
let rafId = null;

function requestDraw() {
    if (isDirty) return; // Already scheduled
    isDirty = true;

    if (!rafId) {
        rafId = requestAnimationFrame(() => {
            if (isDirty) {
                draw();
                isDirty = false;
            }
            rafId = null;
        });
    }
}

/*
 * WEBGL PROFESSIONAL BLEND MODE RENDERER
 */
let glCanvas = document.createElement('canvas');
let gl = glCanvas.getContext('webgl', { preserveDrawingBuffer: true });
let glProgram = null;
let glPptTexture = null;
let glBgTexture = null;
let glBuffer = null;

// Vertex Shader
const vsSource = `
    attribute vec2 a_position;
    varying vec2 v_texCoord;
    void main() {
        v_texCoord = a_position * 0.5 + 0.5;
        v_texCoord.y = 1.0 - v_texCoord.y;
        gl_Position = vec4(a_position, 0, 1);
    }
`;

// Fragment Shader - Professional Blend Modes with Gamma Correction
const fsSource = `
    precision highp float;

    uniform sampler2D u_pptTexture;    // PPT foreground
    uniform sampler2D u_bgTexture;     // Background image
    uniform mat3 u_matrix;             // Inverse Homography Matrix
    uniform int u_blendMode;           // 0=normal, 1=multiply, 2=screen, 3=overlay, 4=soft-light
    uniform float u_opacity;           // Opacity 0.0 - 1.0
    uniform vec4 u_bgRect;             // x, y, w, h (normalized 0..1) where background image should be drawn

    varying vec2 v_texCoord;           // Screen coordinate (0 to 1)

    // Gamma Correction: sRGB to Linear
    vec3 sRGBtoLinear(vec3 color) {
        return pow(color, vec3(2.2));
    }

    // Gamma Correction: Linear to sRGB
    vec3 linearToSRGB(vec3 color) {
        return pow(color, vec3(1.0 / 2.2));
    }

    // Blend Mode: Multiply (正片叠底)
    vec3 blendMultiply(vec3 base, vec3 blend) {
        return base * blend;
    }

    // Blend Mode: Screen (滤色)
    vec3 blendScreen(vec3 base, vec3 blend) {
        return vec3(1.0) - (vec3(1.0) - base) * (vec3(1.0) - blend);
    }

    // Blend Mode: Overlay (叠加) - Photoshop Standard
    vec3 blendOverlay(vec3 base, vec3 blend) {
        vec3 result;
        result.r = base.r < 0.5 ? 2.0 * base.r * blend.r : 1.0 - 2.0 * (1.0 - base.r) * (1.0 - blend.r);
        result.g = base.g < 0.5 ? 2.0 * base.g * blend.g : 1.0 - 2.0 * (1.0 - base.g) * (1.0 - blend.g);
        result.b = base.b < 0.5 ? 2.0 * base.b * blend.b : 1.0 - 2.0 * (1.0 - base.b) * (1.0 - blend.b);
        return result;
    }

    // Blend Mode: Soft Light (柔光) - Photoshop Pegtop Formula
    vec3 blendSoftLight(vec3 base, vec3 blend) {
        return (vec3(1.0) - 2.0 * blend) * base * base + 2.0 * blend * base;
    }

    void main() {
        // 1. Sample background at screen position (Handling padding/crop)
        vec4 bgColor = vec4(0.0); // Default transparent
        bool isInsideBgArea = false;

        // Map current screen coord to background texture coord based on u_bgRect
        vec2 bgUV = (v_texCoord - u_bgRect.xy) / u_bgRect.zw;

        // Check if we are inside the background image area
        if (bgUV.x >= 0.0 && bgUV.x <= 1.0 && bgUV.y >= 0.0 && bgUV.y <= 1.0) {
            bgColor = texture2D(u_bgTexture, bgUV);
            isInsideBgArea = true;
        }

        // 2. Calculate PPT perspective coordinates
        vec3 srcPos = u_matrix * vec3(v_texCoord.x, v_texCoord.y, 1.0);
        vec2 pptCoord = srcPos.xy / srcPos.z;

        // 3. Check if PPT coordinate is in bounds
        if (pptCoord.x < 0.0 || pptCoord.x > 1.0 || pptCoord.y < 0.0 || pptCoord.y > 1.0) {
            gl_FragColor = bgColor;
            return;
        }

        // 4. Sample PPT texture
        vec4 pptColor = texture2D(u_pptTexture, pptCoord);
        pptColor.a *= u_opacity;

        // 5. Early exit if PPT is fully transparent
        if (pptColor.a == 0.0) {
            gl_FragColor = bgColor;
            return;
        }

        // 6. If outside background area, don't render PPT (keep transparent)
        if (!isInsideBgArea) {
            gl_FragColor = vec4(0.0);
            return;
        }

        // 7. Convert to linear color space for proper blending
        vec3 baseLinear = sRGBtoLinear(bgColor.rgb);
        vec3 blendLinear = sRGBtoLinear(pptColor.rgb);

        // 8. Apply blend mode
        vec3 blendedLinear;
        if (u_blendMode == 0) {
            // Normal - no blending
            blendedLinear = blendLinear;
        } else if (u_blendMode == 1) {
            // Multiply
            blendedLinear = blendMultiply(baseLinear, blendLinear);
        } else if (u_blendMode == 2) {
            // Screen
            blendedLinear = blendScreen(baseLinear, blendLinear);
        } else if (u_blendMode == 3) {
            // Overlay
            blendedLinear = blendOverlay(baseLinear, blendLinear);
        } else if (u_blendMode == 4) {
            // Soft Light
            blendedLinear = blendSoftLight(baseLinear, blendLinear);
        } else {
            blendedLinear = blendLinear;
        }

        // 9. Convert back to sRGB
        vec3 blendedSRGB = linearToSRGB(blendedLinear);

        // 10. Alpha compositing - Simple blend with opacity
        vec3 outRGB = blendedSRGB * pptColor.a + bgColor.rgb * (1.0 - pptColor.a);
        float outAlpha = pptColor.a + bgColor.a * (1.0 - pptColor.a);

        gl_FragColor = vec4(outRGB, outAlpha);
    }
`;

function initWebGL() {
    if (!gl) return;

    // Create Shader Program
    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    glProgram = createProgram(gl, vertexShader, fragmentShader);

    // Create Buffer (Full screen quad)
    const positions = new Float32Array([
        -1, -1,
         1, -1,
        -1,  1,
        -1,  1,
         1, -1,
         1,  1,
    ]);
    glBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Create Texture objects
    glPptTexture = gl.createTexture();
    glBgTexture = gl.createTexture();
}

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    return program;
}

function updateWebGLPptTexture(image) {
    // PERFORMANCE: Skip upload if texture is already uploaded
    if (!TextureManager.needsUploadPpt(image)) {
        return;
    }

    gl.bindTexture(gl.TEXTURE_2D, glPptTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
        console.error('   ❌ PPT texture upload error:', err);
    } else {
        TextureManager.markPptUploaded(image);
    }
}

function updateWebGLBgTexture(image) {
    // PERFORMANCE: Skip upload if texture is already uploaded
    if (!TextureManager.needsUploadBg(image)) {
        return;
    }

    gl.bindTexture(gl.TEXTURE_2D, glBgTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
        console.error('   ❌ BG texture upload error:', err);
    } else {
        TextureManager.markBgUploaded(image);
    }
}

// Blend mode mapping
const blendModeMap = {
    'normal': 0,
    'multiply': 1,
    'screen': 2,
    'overlay': 3,
    'soft-light': 4
};

// Render the WebGL scene with professional blend modes
function renderWebGL(width, height, bgImage, pptImage, matrix, blendMode, opacity, bgRect = {x:0, y:0, w:1, h:1}) {
    // CRITICAL: Set canvas size FIRST (this clears the buffer)
    glCanvas.width = width;
    glCanvas.height = height;
    gl.viewport(0, 0, width, height);

    // CRITICAL: Upload textures AFTER canvas resize to avoid data loss
    updateWebGLBgTexture(bgImage);
    updateWebGLPptTexture(pptImage);

    gl.useProgram(glProgram);

    // Bind Position Attribute
    const positionLocation = gl.getAttribLocation(glProgram, "a_position");
    gl.enableVertexAttribArray(positionLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, glBuffer);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    // Bind Textures
    // Texture Unit 0: PPT Texture
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, glPptTexture);
    gl.uniform1i(gl.getUniformLocation(glProgram, "u_pptTexture"), 0);

    // Texture Unit 1: Background Texture
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, glBgTexture);
    gl.uniform1i(gl.getUniformLocation(glProgram, "u_bgTexture"), 1);

    // Set Matrix Uniform
    const matrixLocation = gl.getUniformLocation(glProgram, "u_matrix");
    const matrixFlat = new Float32Array([
        matrix[0][0], matrix[1][0], matrix[2][0],
        matrix[0][1], matrix[1][1], matrix[2][1],
        matrix[0][2], matrix[1][2], matrix[2][2]
    ]);
    gl.uniformMatrix3fv(matrixLocation, false, matrixFlat);

    // Set Blend Mode Uniform
    const blendModeValue = blendModeMap[blendMode] || 0;
    gl.uniform1i(gl.getUniformLocation(glProgram, "u_blendMode"), blendModeValue);

    // Set Opacity Uniform
    gl.uniform1f(gl.getUniformLocation(glProgram, "u_opacity"), opacity);

    // Set Background Rect Uniform
    gl.uniform4f(gl.getUniformLocation(glProgram, "u_bgRect"), bgRect.x, bgRect.y, bgRect.w, bgRect.h);

    // Enable blending for transparency
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    // Draw
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Check for WebGL errors
    const err = gl.getError();
    if (err !== gl.NO_ERROR) {
        console.error('❌ [renderWebGL] WebGL Error:', err);
    }
}

// Compute Inverse Homography Matrix: Dest (Screen 0..1) -> Src (Texture 0..1)
function getInverseHomography(w, h, pts) {
    // Normalize points to 0..1 range relative to canvas size
    // Since we removed the Y-flip in shader, we need to keep Y as-is here
    const nPts = pts.map(p => ({ x: p.x / w, y: p.y / h }));

    // We want a matrix H that maps Dest(nPts) -> Src(Corners 0..1)
    // Source (Texture) Corners: (0,0), (1,0), (1,1), (0,1)
    // Dest (Screen) Points: nPts[0], nPts[1], nPts[2], nPts[3]

    // Standard getHomographyMatrix calculates Src -> Dest.
    // So we calculate Src=nPts -> Dest=Corners
    // This gives us the mapping from Screen Pixel -> Texture Coordinate directly.

    const src = nPts;
    const dst = [
        {x: 0, y: 0}, // TL - top-left of texture
        {x: 1, y: 0}, // TR - top-right of texture
        {x: 1, y: 1}, // BR - bottom-right of texture
        {x: 0, y: 1}  // BL - bottom-left of texture
    ];

    // Re-use the existing solver but with normalized coords (width=1, height=1)
    // Note: Our solver takes (w, h, dstPoints) assuming src is (0,0)->(w,h).
    // Here both are arbitrary quads essentially.

    // Let's use the general solver logic adapted here.
    return solveGeneralHomography(src, dst);
}

function solveGeneralHomography(src, dst) {
    let a = [];
    let b = [];

    for (let i = 0; i < 4; i++) {
        let sx = src[i].x;
        let sy = src[i].y;
        let dx = dst[i].x;
        let dy = dst[i].y;

        a.push([sx, sy, 1, 0, 0, 0, -sx*dx, -sy*dx]);
        b.push(dx);
        a.push([0, 0, 0, sx, sy, 1, -sx*dy, -sy*dy]);
        b.push(dy);
    }

    const h = solveLinearSystem(a, b);

    return [
        [h[0], h[1], h[2]],
        [h[3], h[4], h[5]],
        [h[6], h[7], 1]
    ];
}

// Initialize WebGL
initWebGL();


/*
 * HELPER FUNCTIONS
 */

function sanitizeFolderName(name) {
    const cleaned = String(name || '')
        .replace(/[\\/:*?"<>|]/g, '_')
        .replace(/\s+/g, ' ')
        .trim();
    return cleaned || '场景化图片';
}

function getSingleOutputFileName(baseName) {
    return `${baseName}_output.png`;
}

function getBatchOutputFileName(baseName, index) {
    const serial = String(index).padStart(3, '0');
    return `${baseName}${serial}.png`;
}

// Show toast notification using global system
function showToast(message, type = 'info', duration = 3000, options = {}) {
    if (window.showToast) {
        window.showToast(message, type, duration, options);
    } else {
        console.log(`[Toast] ${type}: ${message}`);
    }
}

// Hide toast notification (No-op as global handles it)
function hideToast() {
    // Handled by global toast
}

/*
 * SAVE PATH MANAGEMENT
 */

// Load save path from localStorage
function loadSavePath() {
    const stored = localStorage.getItem(STORAGE_KEY_SAVE_PATH);
    if (stored) {
        saveFolderPath = stored;
        updateSavePathUI(stored);
    }
}

// Update save path UI display
function updateSavePathUI(path) {
    if (saveFolderPathDisplay) {
        if (path) {
            saveFolderPathDisplay.textContent = path;
            saveFolderPathDisplay.title = path;
        } else {
            saveFolderPathDisplay.textContent = '未设置';
            saveFolderPathDisplay.title = '未设置';
        }
    }
}

// Handle save folder selection
async function handleSelectSaveFolder() {
    try {
        const result = await window.appApi.selectSaveDirectory();

        if (result && !result.canceled && result.filePaths && result.filePaths.length > 0) {
            saveFolderPath = result.filePaths[0];
            localStorage.setItem(STORAGE_KEY_SAVE_PATH, saveFolderPath);
            updateSavePathUI(saveFolderPath);
            showToast('保存位置已设置', 'success', 2000);
        }
    } catch (error) {
        console.error('选择保存目录失败:', error);
        showToast('选择保存目录失败: ' + error.message, 'error', 3000);
    }
}

// Initialize save path on load
loadSavePath();

// Bind save folder button
if (selectSaveFolderBtn) {
    selectSaveFolderBtn.addEventListener('click', handleSelectSaveFolder);
}

/*
 * EXISTING LOGIC ADAPTED
 */

// Gaussian elimination (Unchanged)
function solveLinearSystem(A, b) {
    const n = A.length;
    for (let i = 0; i < n; i++) {
        let maxEl = Math.abs(A[i][i]);
        let maxRow = i;
        for (let k = i + 1; k < n; k++) {
            if (Math.abs(A[k][i]) > maxEl) {
                maxEl = Math.abs(A[k][i]);
                maxRow = k;
            }
        }
        let tmp = A[maxRow]; A[maxRow] = A[i]; A[i] = tmp;
        let t = b[maxRow]; b[maxRow] = b[i]; b[i] = t;
        for (let k = i + 1; k < n; k++) {
            let c = -A[k][i] / A[i][i];
            for (let j = i; j < n; j++) {
                if (i === j) { A[k][j] = 0; } else { A[k][j] += c * A[i][j]; }
            }
            b[k] += c * b[i];
        }
    }
    let x = new Array(n);
    for (let i = n - 1; i > -1; i--) {
        let sum = 0;
        for (let j = i + 1; j < n; j++) { sum += A[i][j] * x[j]; }
        x[i] = (b[i] - sum) / A[i][i];
    }
    return x;
}

// Initialization
function initPoints(imgWidth, imgHeight) {
    // Points default to inside the image area (offset by PADDING)
    const margin = 100;
    const startX = PADDING + margin;
    const startY = PADDING + margin;
    const endX = PADDING + imgWidth - margin;
    const endY = PADDING + imgHeight - margin;

    points = [
        { x: startX, y: startY }, // TL
        { x: endX, y: startY }, // TR
        { x: endX, y: endY }, // BR
        { x: startX, y: endY } // BL
    ];
}

// Draw Loop
function draw(showControls = true) {
    if (!bgImage) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (activePptIndex >= 0 && activePptIndex < pptImages.length) {
        // WebGL renders everything: background + blended PPT
        const pptImg = pptImages[activePptIndex].img;

        // Calculate Inverse Homography
        const invH = getInverseHomography(canvas.width, canvas.height, points);

        // Calculate bgRect for editor (centered with padding)
        // PERFORMANCE: Use preview scaled dimensions
        const previewWidth = Math.floor(bgImage.width * previewScale);
        const previewHeight = Math.floor(bgImage.height * previewScale);
        const bgRect = {
            x: PADDING / canvas.width,
            y: PADDING / canvas.height,
            w: previewWidth / canvas.width,
            h: previewHeight / canvas.height
        };

        // Render with professional blend modes (textures uploaded inside)
        renderWebGL(
            canvas.width,
            canvas.height,
            bgImage,
            pptImg,
            invH,
            blendModeSelect.value,
            opacityInput.value / 100,
            bgRect
        );

        // Draw the complete composited result
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        ctx.drawImage(glCanvas, 0, 0);
    } else {
        // Only draw background if no PPT selected
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1.0;
        // Draw background offset by padding, scaled to preview size
        const previewWidth = Math.floor(bgImage.width * previewScale);
        const previewHeight = Math.floor(bgImage.height * previewScale);
        ctx.drawImage(bgImage, PADDING, PADDING, previewWidth, previewHeight);
    }

    // Draw Controls (Points and Lines)
    if (showControls) {
        drawControls();
    }
}

function drawControls() {
    // Calculate scale factor based on canvas size to maintain consistent visual appearance
    // Use the smaller dimension to ensure controls are always visible
    const baseSize = Math.min(canvas.width, canvas.height);
    const scaleFactor = baseSize / 1000; // Normalize to a 1000px baseline

    // Scale line width and point radius proportionally
    const lineWidth = Math.max(2, 2 * scaleFactor);
    const pointRadius = Math.max(6, 6 * scaleFactor);
    const pointStrokeWidth = Math.max(2, 2 * scaleFactor);

    // Draw the quad outline
    ctx.strokeStyle = '#4f46e5';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.lineTo(points[2].x, points[2].y);
    ctx.lineTo(points[3].x, points[3].y);
    ctx.closePath();
    ctx.stroke();

    // Draw the corner points
    points.forEach((p, i) => {
        ctx.fillStyle = draggingPoint === i ? '#fbbf24' : '#ffffff';
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = pointStrokeWidth;
        ctx.beginPath();
        ctx.arc(p.x, p.y, pointRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    });
}


// Event Listeners
bgInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    bgImageTitle = sanitizeFolderName(file.name.replace(/\.[^/.]+$/, ''));

    // Store file size in bytes
    bgImageFileSize = file.size;
    console.log(`📊 Background image file size: ${(bgImageFileSize / 1024 / 1024).toFixed(2)} MB`);

    const reader = new FileReader();
    reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
            bgImage = img;

            // PERFORMANCE: Calculate proxy resolution scale
            const maxDim = Math.max(img.width, img.height);
            if (maxDim > MAX_PREVIEW_SIZE) {
                previewScale = MAX_PREVIEW_SIZE / maxDim;
                console.log(`🎯 [Proxy Resolution] Original: ${img.width}x${img.height}, Scale: ${previewScale.toFixed(3)}x`);
            } else {
                previewScale = 1.0;
            }

            // Canvas uses scaled dimensions for preview
            const previewWidth = Math.floor(img.width * previewScale);
            const previewHeight = Math.floor(img.height * previewScale);
            canvas.width = previewWidth + PADDING * 2;
            canvas.height = previewHeight + PADDING * 2;

            console.log(`📐 [Canvas Size] Preview: ${canvas.width}x${canvas.height} (${previewScale === 1.0 ? 'Original' : 'Scaled'})`);

            // Smart Initial Zoom
            const wrapper = doc.querySelector('.canvas-wrapper');
            // Width is reliable (constrained by grid layout), subtract padding (40px * 2)
            const availableW = wrapper.clientWidth - 80;
            // Height is NOT reliable (initially min-height), so use Window height estimate
            // Reserve space for Header (~100px), Controls (~100px), Padding (~80px) => ~280px
            const availableH = window.innerHeight - 300;

            // Strategy:
            // 1. If image exceeds available screen area, scale down to fit (Adaptive).
            // 2. Otherwise, use 100% original size.
            if (previewWidth > availableW || previewHeight > availableH) {
                const scaleW = availableW / previewWidth;
                const scaleH = availableH / previewHeight;
                currentZoom = Math.min(scaleW, scaleH);
            } else {
                currentZoom = 1.0;
            }
            updateCanvasZoom();

            initPoints(previewWidth, previewHeight);
            instruction.style.display = 'none';
            canvas.style.display = 'block'; // Show canvas
            requestDraw(); // PERFORMANCE: Use RAF
            checkReadyState();
        };
        img.src = event.target.result;
    };
    reader.readAsDataURL(file);
});

// Zoom Logic
function updateCanvasZoom() {
    canvas.style.width = `${canvas.width * currentZoom}px`;
    canvas.style.height = `${canvas.height * currentZoom}px`;
}

canvas.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = currentZoom * delta;
        
        // Limit zoom
        if (newZoom >= 0.1 && newZoom <= 5.0) {
            currentZoom = newZoom;
            updateCanvasZoom();
        }
    }
}, { passive: false });

pptInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    pptImages = [];
    previewList.innerHTML = '';

    // Reset Label
    const originalLabel = doc.querySelector('label[for="pptInput"]').textContent;
    doc.querySelector('label[for="pptInput"]').textContent = '处理中...';

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
            await processImageFile(file, i);
        }
    }

    pptImages.sort((a, b) => a.originalIndex - b.originalIndex);
    updatePreviewList();
    if (pptImages.length > 0) {
        activePptIndex = 0;
        highlightActivePreview();
    }
    requestDraw(); // PERFORMANCE: Use RAF
    checkReadyState();

    doc.querySelector('label[for="pptInput"]').textContent = originalLabel;
});

function processImageFile(file, index) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                pptImages.push({
                    name: file.name,
                    img: img,
                    originalIndex: index
                });
                resolve();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

function updatePreviewList() {
    previewList.innerHTML = '';
    pptImages.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'preview-item';

        // Wrap content in a container for flex layout if needed,
        // but simplest is to keep direct children as style.css expects flex on .preview-item

        const thumb = document.createElement('img');
        thumb.src = item.img.src;

        const name = document.createElement('span');
        name.textContent = item.name;
        // Ensure name takes available space to push button to right if needed,
        // but style.css flex-grow might be needed on name wrapper if we want button far right.
        // Actually, style.css .preview-item has justify-content: space-between now.
        // We need to group img+name so they stay left.

        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.alignItems = 'center';
        leftGroup.style.overflow = 'hidden';
        leftGroup.style.flex = '1';
        leftGroup.appendChild(thumb);
        leftGroup.appendChild(name);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-btn-right';
        deleteBtn.innerHTML = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
        deleteBtn.title = '删除';
        deleteBtn.onclick = (e) => {
            e.stopPropagation();
            deletePptImage(index);
        };

        div.appendChild(leftGroup);
        div.appendChild(deleteBtn);

        div.onclick = () => {
            activePptIndex = index;
            highlightActivePreview();
            requestDraw(); // PERFORMANCE: Use RAF
        };

        previewList.appendChild(div);
    });
}

function deletePptImage(index) {
    if (index >= 0 && index < pptImages.length) {
        pptImages.splice(index, 1);

        // Adjust active index
        if (pptImages.length === 0) {
            activePptIndex = -1;
            bgImage = bgImage; // Trigger redraw clear
        } else if (activePptIndex === index) {
            activePptIndex = Math.min(index, pptImages.length - 1);
        } else if (activePptIndex > index) {
            activePptIndex--;
        }

        updatePreviewList();
        if (activePptIndex !== -1) highlightActivePreview();
        requestDraw(); // PERFORMANCE: Use RAF
        checkReadyState();
    }
}

function highlightActivePreview() {
    const items = previewList.querySelectorAll('.preview-item');
    items.forEach((item, idx) => {
        if (idx === activePptIndex) item.classList.add('active');
        else item.classList.remove('active');
    });
}

// Mouse Interactions
function getMousePos(evt) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
        x: (evt.clientX - rect.left) * scaleX,
        y: (evt.clientY - rect.top) * scaleY
    };
}

canvas.addEventListener('mousedown', (e) => {
    const pos = getMousePos(e);
    draggingPoint = points.findIndex(p => {
        const dist = Math.sqrt((p.x - pos.x) ** 2 + (p.y - pos.y) ** 2);
        // Increase hit area slightly for better UX with padding
        return dist < 30 * (canvas.width / canvas.clientWidth);
    });
    if (draggingPoint !== -1) {
        requestDraw(); // PERFORMANCE: Use RAF
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (draggingPoint !== -1) {
        const pos = getMousePos(e);
        points[draggingPoint] = pos;
        requestDraw(); // PERFORMANCE: Use RAF instead of direct draw()
    } else {
        const pos = getMousePos(e);
        const hover = points.some(p => {
             const dist = Math.sqrt((p.x - pos.x) ** 2 + (p.y - pos.y) ** 2);
             return dist < 30 * (canvas.width / canvas.clientWidth);
        });
        canvas.style.cursor = hover ? 'move' : 'default';
    }
});

canvas.addEventListener('mouseup', () => {
    draggingPoint = -1;
    requestDraw(); // PERFORMANCE: Use RAF
});

canvas.addEventListener('mouseleave', () => {
    draggingPoint = -1;
    requestDraw(); // PERFORMANCE: Use RAF
});


// Settings Controls
opacityInput.addEventListener('input', (e) => {
    opacityVal.textContent = e.target.value + '%';
    requestDraw(); // PERFORMANCE: Use RAF
});

blendModeSelect.addEventListener('change', () => {
    requestDraw(); // PERFORMANCE: Use RAF
});

resetPointsBtn.addEventListener('click', () => {
    if (bgImage) {
        // PERFORMANCE: Use preview scaled dimensions
        const previewWidth = Math.floor(bgImage.width * previewScale);
        const previewHeight = Math.floor(bgImage.height * previewScale);
        initPoints(previewWidth, previewHeight);
        requestDraw(); // PERFORMANCE: Use RAF
    }
});

// Download & Batch Logic
function checkReadyState() {
    const ready = bgImage && pptImages.length > 0;
    downloadAllBtn.disabled = !ready;
    
    if (ready) {
        if (pptImages.length === 1) {
            downloadAllBtn.textContent = '导出图片';
        } else {
            downloadAllBtn.textContent = '导出全部';
        }
    } else {
        downloadAllBtn.textContent = '导出全部';
    }
}


downloadAllBtn.addEventListener('click', async () => {
    if (window.licenseManager) {
        const allowed = await window.licenseManager.checkAccess("compose");
        if (!allowed) return;
    }
    if (!bgImage || pptImages.length === 0) return;

    // Check if save folder is set
    if (!saveFolderPath) {
        showToast('请先选择文件保存位置', 'error', 3000);
        return;
    }

    const isSingleMode = pptImages.length === 1;
    if (DEBUG_MODE) console.log(`\n🚀 ========== ${isSingleMode ? 'SINGLE' : 'BATCH'} DOWNLOAD START ==========`);
    if (DEBUG_MODE) console.log(`📊 Config: ${pptImages.length} images, blend mode: ${blendModeSelect.value}, opacity: ${opacityInput.value}%`);

    const originalBtnText = downloadAllBtn.textContent;
    downloadAllBtn.textContent = '处理中...';
    downloadAllBtn.disabled = true;

    const originalActiveIndex = activePptIndex;

    // Create High-Res Context
    // 1. Get GPU Limits
    const maxViewportDims = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const maxRenderSize = Math.min(maxViewportDims[0], maxViewportDims[1], maxTextureSize);

    if (DEBUG_MODE) console.log(`🖥️ GPU Limits: Max Viewport [${maxViewportDims}], Max Texture ${maxTextureSize}`);

    // 2. Start with maximum scale factor - will adjust based on output size
    let scaleFactor = 2.0;
    if (DEBUG_MODE) console.log(`📊 Starting with ${scaleFactor}x scale factor (will adjust based on output file size)`);

    // Target dimensions are just the BG image area (no padding)
    const targetBaseW = bgImage.width;
    const targetBaseH = bgImage.height;

    const requiredW = targetBaseW * scaleFactor;
    const requiredH = targetBaseH * scaleFactor;

    // 3. Verify against GPU limits and adjust if needed
    if (requiredW > maxRenderSize || requiredH > maxRenderSize) {
        const safeScaleW = maxRenderSize / targetBaseW;
        const safeScaleH = maxRenderSize / targetBaseH;
        const gpuLimitedScale = Math.min(safeScaleW, safeScaleH); // Keep aspect ratio

        if (gpuLimitedScale < scaleFactor) {
            scaleFactor = Math.floor(gpuLimitedScale * 100) / 100; // Round down to 2 decimals
            console.warn(`⚠️ High-res size (${requiredW}x${requiredH}) exceeds GPU limit (${maxRenderSize}). Reduced scale factor to ${scaleFactor}`);
        }
    }

    let hrWidth = Math.floor(targetBaseW * scaleFactor);
    let hrHeight = Math.floor(targetBaseH * scaleFactor);

    if (DEBUG_MODE) console.log(`📐 Requested High-res canvas: ${hrWidth}x${hrHeight} (Image Only, ${scaleFactor}x scale factor)`);

    // CRITICAL: Test if GPU can actually create the requested size
    // by creating a test WebGL canvas and checking actual drawingBuffer size
    glCanvas.width = hrWidth;
    glCanvas.height = hrHeight;
    gl.viewport(0, 0, hrWidth, hrHeight);

    const actualWidth = gl.drawingBufferWidth;
    const actualHeight = gl.drawingBufferHeight;

    if (DEBUG_MODE) console.log(`📐 Actual DrawingBuffer size: ${actualWidth}x${actualHeight}`);

    // If actual size is smaller, use the actual size to avoid blank areas
    if (actualWidth < hrWidth || actualHeight < hrHeight) {
        console.warn(`⚠️ GPU cannot create ${hrWidth}x${hrHeight} buffer. Using actual size ${actualWidth}x${actualHeight}`);
        hrWidth = actualWidth;
        hrHeight = actualHeight;

        // Recalculate scaleFactor based on actual dimensions
        scaleFactor = Math.min(hrWidth / targetBaseW, hrHeight / targetBaseH);
        if (DEBUG_MODE) console.log(`📐 Adjusted scale factor to ${scaleFactor.toFixed(2)}x`);
    } else {
        if (DEBUG_MODE) console.log(`✅ GPU successfully allocated ${hrWidth}x${hrHeight} buffer`);
    }

    const hrCanvas2D = document.createElement('canvas');
    hrCanvas2D.width = hrWidth;
    hrCanvas2D.height = hrHeight;
    const hrCtx = hrCanvas2D.getContext('2d');

    // Helper function to render a single image with given dimensions
    async function renderSingleImage(pptImg, width, height, scale) {
        // IMPORTANT: Reset texture cache for download rendering
        // because we're using different canvas dimensions
        TextureManager.reset();

        // PERFORMANCE: Convert preview points to original resolution, then scale
        // Step 1: Remove padding from preview points
        // Step 2: Convert from preview scale to original scale
        // Step 3: Apply final export scale
        const scaledPoints = points.map(p => ({
            x: ((p.x - PADDING) / previewScale) * scale,
            y: ((p.y - PADDING) / previewScale) * scale
        }));

        // Since we are rendering the exact BG image size, the homography
        // will map the shifted points correctly relative to the 0..width/height canvas.
        const invH = getInverseHomography(width, height, scaledPoints);

        // For download, we fill the canvas with the BG image, so bgRect is full (0,0,1,1)
        const downloadBgRect = { x: 0, y: 0, w: 1, h: 1 };

        renderWebGL(
            width,
            height,
            bgImage,
            pptImg,
            invH,
            blendModeSelect.value,
            opacityInput.value / 100,
            downloadBgRect
        );

        gl.finish();

        const pixels = new Uint8Array(width * height * 4);
        gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

        // Flip Y-axis
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = width;
        tempCanvas.height = height;
        const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true });

        const flippedImageData = tempCtx.createImageData(width, height);
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = (y * width + x) * 4;
                const dstIdx = ((height - 1 - y) * width + x) * 4;
                flippedImageData.data[dstIdx] = pixels[srcIdx];
                flippedImageData.data[dstIdx + 1] = pixels[srcIdx + 1];
                flippedImageData.data[dstIdx + 2] = pixels[srcIdx + 2];
                flippedImageData.data[dstIdx + 3] = pixels[srcIdx + 3];
            }
        }
        tempCtx.putImageData(flippedImageData, 0, 0);

        const blob = await new Promise(resolve => tempCanvas.toBlob(resolve, 'image/png'));
        return blob;
    }

    // Process first image to determine optimal scale factor
    console.log('\n🔍 Testing output file size with first image...');
    const firstPptImg = pptImages[0].img;
    let testBlob = await renderSingleImage(firstPptImg, hrWidth, hrHeight, scaleFactor);
    let testSizeMB = testBlob.size / 1024 / 1024;
    console.log(`📊 Test output size: ${testSizeMB.toFixed(2)} MB at ${scaleFactor.toFixed(2)}x scale`);

    // Adjust scale factor if output is too large
    // Strategy: Estimate new scale factor based on size ratio
    if (testSizeMB > 10) {
        console.log('⚠️ Output > 10MB, need to reduce scale factor');

        // Estimate scale factor to achieve ~8MB (leaving some margin below 10MB)
        // File size roughly scales with area (scale²)
        const targetSizeMB = 8.0;
        const sizeRatio = targetSizeMB / testSizeMB;
        const estimatedScale = scaleFactor * Math.sqrt(sizeRatio);
        scaleFactor = Math.max(0.5, Math.min(1.0, estimatedScale)); // Clamp between 0.5x - 1.0x
        scaleFactor = Math.floor(scaleFactor * 100) / 100; // Round down to 2 decimals

        console.log(`📐 Calculated scale factor: ${scaleFactor.toFixed(2)}x (to target ~8MB)`);

        hrWidth = Math.floor(targetBaseW * scaleFactor);
        hrHeight = Math.floor(targetBaseH * scaleFactor);

        // Re-render with new size
        testBlob = await renderSingleImage(firstPptImg, hrWidth, hrHeight, scaleFactor);
        testSizeMB = testBlob.size / 1024 / 1024;
        console.log(`📊 Adjusted output size: ${testSizeMB.toFixed(2)} MB at ${scaleFactor.toFixed(2)}x scale`);

    } else if (testSizeMB > 5) {
        console.log('⚠️ Output > 5MB, need to reduce scale factor');

        // Estimate scale factor to achieve ~4MB (leaving margin below 5MB)
        const targetSizeMB = 4.0;
        const sizeRatio = targetSizeMB / testSizeMB;
        const estimatedScale = scaleFactor * Math.sqrt(sizeRatio);
        scaleFactor = Math.max(0.5, Math.min(1.5, estimatedScale)); // Clamp between 0.5x - 1.5x
        scaleFactor = Math.floor(scaleFactor * 100) / 100; // Round down to 2 decimals

        console.log(`📐 Calculated scale factor: ${scaleFactor.toFixed(2)}x (to target ~4MB)`);

        hrWidth = Math.floor(targetBaseW * scaleFactor);
        hrHeight = Math.floor(targetBaseH * scaleFactor);

        // Re-render with new size
        testBlob = await renderSingleImage(firstPptImg, hrWidth, hrHeight, scaleFactor);
        testSizeMB = testBlob.size / 1024 / 1024;
        console.log(`📊 Adjusted output size: ${testSizeMB.toFixed(2)} MB at ${scaleFactor.toFixed(2)}x scale`);

    } else {
        console.log(`✅ Output size acceptable (${testSizeMB.toFixed(2)} MB ≤ 5MB) at ${scaleFactor.toFixed(2)}x scale`);
    }

    // Handle Single Image Download
    if (isSingleMode) {
        try {
            console.log(`\n📦 [Download] Processing single image: ${pptImages[0].name}`);
            console.log(`   Output size: ${testSizeMB.toFixed(2)} MB`);

            const fileName = getSingleOutputFileName(bgImageTitle);

            // Convert blob to ArrayBuffer
            const arrayBuffer = await testBlob.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);

            // Save file directly to selected folder
            const result = await window.appApi.saveImageFile({
                directory: saveFolderPath,
                fileName: fileName,
                buffer: buffer
            });

            if (result.ok) {
                console.log(`   💾 Saved file: ${result.path}`);
                console.log('🎉 ========== SINGLE DOWNLOAD COMPLETE ==========\n');
                const savedPath = result.path;
                showToast(`图片已保存: ${fileName}`, 'success', 5000, {
                    actionText: '打开文件夹',
                    actionCallback: () => {
                        if (window.appApi?.openPath && saveFolderPath) {
                            window.appApi.openPath(saveFolderPath);
                        }
                    }
                });
            } else {
                throw new Error(result.error || '保存失败');
            }
        } catch (error) {
            console.error('保存单张图片失败:', error);
            showToast('导出失败: ' + error.message, 'error', 5000);
        }

        activePptIndex = originalActiveIndex;

        // IMPORTANT: Reset texture cache to restore preview mode
        TextureManager.reset();
        draw(); // Restore UI
        downloadAllBtn.textContent = originalBtnText;
        downloadAllBtn.disabled = false;
        return;
    }

    // Handle Batch Download - Save to folder
    const totalImages = pptImages.length;
    const folderName = bgImageTitle;

    try {
        // Create directory with auto-rename if exists
        const dirResult = await window.appApi.createDirectory({
            baseDir: saveFolderPath,
            dirName: folderName
        });

        if (!dirResult.ok) {
            throw new Error(dirResult.error || '创建文件夹失败');
        }

        const targetDir = dirResult.path;
        console.log(`📁 Created directory: ${targetDir}`);

        let successCount = 0;
        let failCount = 0;

        // Save first image (already rendered)
        try {
            console.log(`\n📦 [Download] Processing image 1/${totalImages}: ${pptImages[0].name}`);
            console.log(`   Output size: ${testSizeMB.toFixed(2)} MB`);

            const fileName = getBatchOutputFileName(bgImageTitle, 1);

            const arrayBuffer = await testBlob.arrayBuffer();
            const buffer = new Uint8Array(arrayBuffer);

            const saveResult = await window.appApi.saveImageFile({
                directory: targetDir,
                fileName: fileName,
                buffer: buffer
            });

            if (saveResult.ok) {
                console.log(`   ✅ Saved: ${fileName}`);
                successCount++;
            } else {
                console.error(`   ❌ Failed: ${fileName} - ${saveResult.error}`);
                failCount++;
            }
        } catch (error) {
            console.error(`   ❌ Error saving image 1:`, error);
            failCount++;
        }

        // Process remaining images
        for (let i = 1; i < totalImages; i++) {
            try {
                console.log(`\n📦 [Download] Processing image ${i + 1}/${totalImages}: ${pptImages[i].name}`);

                const pptImg = pptImages[i].img;
                const blob = await renderSingleImage(pptImg, hrWidth, hrHeight, scaleFactor);
                const sizeMB = blob.size / 1024 / 1024;
                console.log(`   Output size: ${sizeMB.toFixed(2)} MB`);

                const fileName = getBatchOutputFileName(bgImageTitle, i + 1);

                const arrayBuffer = await blob.arrayBuffer();
                const buffer = new Uint8Array(arrayBuffer);

                const saveResult = await window.appApi.saveImageFile({
                    directory: targetDir,
                    fileName: fileName,
                    buffer: buffer
                });

                if (saveResult.ok) {
                    console.log(`   ✅ Saved: ${fileName}`);
                    successCount++;
                } else {
                    console.error(`   ❌ Failed: ${fileName} - ${saveResult.error}`);
                    failCount++;
                }
            } catch (error) {
                console.error(`   ❌ Error saving image ${i + 1}:`, error);
                failCount++;
            }
        }

        console.log('🎉 ========== BATCH DOWNLOAD COMPLETE ==========\n');
        console.log(`✅ Success: ${successCount}, ❌ Failed: ${failCount}`);

        // Show result toast with open folder button
        if (failCount === 0) {
            showToast(`已成功保存 ${successCount} 张图片到文件夹`, 'success', 5000, {
                actionText: '打开文件夹',
                actionCallback: () => {
                    if (window.appApi?.openPath && targetDir) {
                        window.appApi.openPath(targetDir);
                    }
                }
            });
        } else {
            showToast(`导出失败，${failCount} 张图片保存失败`, 'error', 5000);
        }

    } catch (error) {
        console.error('批量保存失败:', error);
        showToast('导出失败: ' + error.message, 'error', 5000);
    }

    activePptIndex = originalActiveIndex;

    // IMPORTANT: Reset texture cache to restore preview mode
    TextureManager.reset();
    draw(); // Restore UI

    downloadAllBtn.textContent = originalBtnText;
    downloadAllBtn.disabled = false;
});
    
