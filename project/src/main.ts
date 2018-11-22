import vertexShader from './shader.vert'
import fragmentShader from './shader.frag'

import mat4 from 'tsm/src/mat4'
import vec3 from 'tsm/src/vec3'

//List where each index n specifies how many times a stem generate a clone on
//average for a stem with n parents.
const STEM_BRANCHING_FACTORS: number[] = [1, 1, 1, 1, 0];

//List where each index n specifies how many non-clone branches may be
//generated by each branch with n parents.
const BRANCHING_FACTORS: number[] = [0, 2, 3, 4, 1, 1];

var canvas : HTMLCanvasElement, gl;

var treeVao, shaderProgram, matLocation;

let leftPressed = false;
let rightPressed = false;

function handleKeyEvent(keyCode: string, newState: boolean) {
    switch (keyCode) {
        case "KeyA":
        case "ArrowLeft":
            leftPressed = newState;
            break;
        case "KeyD":
        case "ArrowRight":
            rightPressed = newState;
            break;
    }    
}

window.addEventListener('keydown', (event) => {
    handleKeyEvent(event.code, true);
    event.preventDefault();
}, true);

window.addEventListener('keyup', (event) => {
    handleKeyEvent(event.code, false);
    event.preventDefault();
}, true);

interface Resource {
    filename: string;
    contents: string;
}

interface Branch {
    endPoint: vec3;
    children: Array<Branch>;
}

let testTree = {
    endPoint: { x: 0, y: 0.1, z: 0 },
    children: []
}

let branchSideIndices = [0, 1, 2, 1, 2, 3];
let BRANCH_RESOLUTION = 8;
let NUM_INDICES = branchSideIndices.length * (BRANCH_RESOLUTION - 1);

let angle = 0;

let lastRenderTime = 0;
function render(time: number): void {
    let dt = Math.min((time - lastRenderTime) / 1000, 1 / 30);
    lastRenderTime = time;

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);

    let v = 0;
    if (leftPressed) {
        v -= 2;
    }
    if (rightPressed) {
        v += 2;
    }
    angle += v * dt;

    let viewMatrix = mat4.lookAt(
        new vec3([Math.sin(angle), 0, Math.cos(angle)]),
        new vec3([0, 0, 0]),
        new vec3([0, 1, 0])
    );

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(shaderProgram);
    gl.bindVertexArray(treeVao);
    gl.uniformMatrix4fv(matLocation, false, viewMatrix.all());
    gl.drawElements(gl.TRIANGLES, NUM_INDICES, gl.UNSIGNED_SHORT, 0);
    //gl.drawArrays(gl.TRIANGLES, 0, 3);

    requestAnimationFrame(render);
}

function createTreeMesh(): WebGLVertexArrayObject {
    let vao = gl.createVertexArray();
    gl.bindVertexArray(vao);

    let vertexPositions = new Float32Array(BRANCH_RESOLUTION * 6);
    let indices = new Uint16Array(NUM_INDICES);

    for (let i = 0; i < BRANCH_RESOLUTION; i++) {
        let angle = i / BRANCH_RESOLUTION * (2 * Math.PI);
        let y = Math.cos(angle) * 0.1;
        let z = Math.sin(angle) * 0.1;

        vertexPositions[i * 6] = -0.5;
        vertexPositions[i * 6 + 1] = y;
        vertexPositions[i * 6 + 2] = z;

        vertexPositions[i * 6 + 3] = 0.5;
        vertexPositions[i * 6 + 4] = y;
        vertexPositions[i * 6 + 5] = z;

        for (let j = 0; j < branchSideIndices.length; j++) {
            indices[i * branchSideIndices.length + j] =
                branchSideIndices[j] + i * 2 % (BRANCH_RESOLUTION * 2);
        }
    }

    let positionLocation = gl.getAttribLocation(shaderProgram, "a_position");
    let positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertexPositions, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(positionLocation);
    let size = 3, type = gl.FLOAT, normalize = false, stride = 0, offset = 0;
    gl.vertexAttribPointer(positionLocation, size, type, normalize, stride, offset);

    let indexBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

    return vao;
}

/**
 * Compiles a shader to be used in a GPU program.
 * @param {number} type - The type of shader. gl.VERTEX_SHADER/gl.FRAGMENT_SHADER/etc
 * @param {string} source - The shader source code.
 * @returns {WebGLShader} The OpenGL shader id of the compiled shader
 */
function createShader(type: number, source: string): WebGLShader {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    // Log an error if the compilation fails
    var success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);

    if (success) {
        return shader;
    } else {
        console.log(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
}

function createProgram(shaderSources: Array<Resource>): WebGLProgram {
    let shaderTypes = {
        "shader.vert": gl.VERTEX_SHADER,
        "shader.frag": gl.FRAGMENT_SHADER
    };

    var program = gl.createProgram();
    for (let shaderData of shaderSources) {
        let shader = createShader(
            shaderTypes[shaderData.filename],
            shaderData.contents
        );
        gl.attachShader(program, shader);
    }
    gl.linkProgram(program);

    // Log an error if the compilation failed
    var success = gl.getProgramParameter(program, gl.LINK_STATUS);
    if (success) {
        return program;
    } else {
        console.log(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
}

function onLoad(): void {
    canvas = document.querySelector("#glCanvas");
    gl = canvas.getContext("webgl2");

    if (gl === null) {
        alert("Unable to initialize WebGL");
        return;
    }

    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    shaderProgram = createProgram([
        { filename: "shader.vert", contents: vertexShader },
        { filename: "shader.frag", contents: fragmentShader }
    ]);

    treeVao = createTreeMesh();
    matLocation = gl.getUniformLocation(shaderProgram, "mat");

    requestAnimationFrame(render);
}

window.onload = () => onLoad();
